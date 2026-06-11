import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom, Subject } from 'rxjs';
import { ObjectUploadService, SessionService, UserRole } from 'shared-utils';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GroupMember {
  id: string;
  nombre: string;
  apellido: string;
  username: string;
  avatarUrl?: string;
  cargo?: string;
}

export interface WorkGroup {
  id: string;
  nombre: string;
  lider: GroupMember;
  miembros: GroupMember[];
  expanded?: boolean;
  changingLeader?: boolean;
  leaderCandidates?: GroupMember[];
  selectedNewLeader?: string;
  savingLeader?: boolean;
}

export interface CollaboratorFlat {
  id: string | number;
  nombre: string;
  apellido: string;
  username?: string | null;
  avatarUrl?: string | null;
  cargo?: string | null;
  grupoNombre?: string | null;
}

// Raw shape returned by the groups API
interface WorkGroupRaw {
  grupoId: string;
  nombre: string;
  descripcion?: string;
  liderUuid: string;
  liderNombre: string;
  liderApellido: string;
  activo: boolean;
  creadoEn: string;
  miembros: Array<{
    miembroId: string;
    usuarioUuid: string;
    nombre: string;
    apellido: string;
    avatarUrl?: string | null;
    cargoEnGrupo?: string;
  }>;
}

export interface SocialLink {
  tipo: 'LINKEDIN' | 'TWITTER' | 'WEBSITE' | 'OTRO';
  url: string;
}

interface AddressData {
  calle?: string;
  numero?: string;
  ciudad?: string;
  comuna?: string;
  region?: string;
}

export interface OrgProfileData {
  id: string;
  rut: string;
  razonSocial: string;
  tipo?: 'CEDENTE' | 'FINANCIERA' | 'BROKER';
  logoUrl?: string;
  bannerUrl?: string;
  descripcion?: string;
  direccionTributaria?: AddressData;
  ecosistemaDigital?: SocialLink[];
}

type LinkTipo = SocialLink['tipo'];

const ADMIN_ROLES = new Set<UserRole>([
  'ADMIN',
  'SUPER_ADMIN',
  'ADMIN_CEDENTE',
  'ADMIN_FINANCIADORA',
  'ADMIN_BROKER',
]);

const LINK_TIPO_LABELS: Record<LinkTipo, string> = {
  LINKEDIN: 'LinkedIn',
  TWITTER: 'Twitter / X',
  WEBSITE: 'Sitio web',
  OTRO: 'Otro',
};

const LINK_TIPO_ICONS: Record<LinkTipo, string> = {
  LINKEDIN: 'work',
  TWITTER: 'alternate_email',
  WEBSITE: 'language',
  OTRO: 'link',
};

// ── Component ──────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-org-profile',
  templateUrl: './org-profile.component.html',
  styleUrls: ['./org-profile.component.scss'],
  standalone: false,
})
export class OrgProfileComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  orgId = '';

  // ── Data ─────────────────────────────────────────────────────────────────────
  org: OrgProfileData | null = null;
  groups: WorkGroup[] = [];
  loading = true;
  loadingGroups = true;
  error: string | null = null;

  // ── Admin gate ───────────────────────────────────────────────────────────────
  get isAdmin(): boolean {
    const rol = this.session.userRole();
    return !!rol && ADMIN_ROLES.has(rol);
  }

  // ── Description edit ────────────────────────────────────────────────────────
  editingDescription = false;
  descriptionDraft = '';
  savingDescription = false;
  descriptionError: string | null = null;

  // ── Ecosistema digital ──────────────────────────────────────────────────────
  showAddLinkForm = false;
  editingLinkIndex: number | null = null;
  linkForm!: FormGroup;
  savingLink = false;
  linkError: string | null = null;
  readonly LINK_TIPO_OPTS = Object.keys(LINK_TIPO_LABELS) as LinkTipo[];
  readonly LINK_TIPO_LABELS = LINK_TIPO_LABELS;
  readonly LINK_TIPO_ICONS = LINK_TIPO_ICONS;

  // ── Banner / logo upload ────────────────────────────────────────────────────
  uploadingBanner = false;
  uploadingLogo = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly fb: FormBuilder,
    readonly session: SessionService,
    private readonly uploadService: ObjectUploadService,
  ) { }

  ngOnInit(): void {
    this.orgId = this.route.snapshot.params['id'] ?? '';
    this.buildLinkForm();
    this.loadOrg();
    this.loadGroups();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Forms ─────────────────────────────────────────────────────────────────────

  private buildLinkForm(): void {
    this.linkForm = this.fb.group({
      tipo: ['WEBSITE', Validators.required],
      url: ['', [Validators.required, Validators.pattern(/^https:\/\/.+/)]],
    });
  }

  // ── Data loading ──────────────────────────────────────────────────────────────

  async loadOrg(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const { data: raw } = await firstValueFrom(
        this.http.get<any>(`/api/bff/organizacion/${this.orgId}`, {
          withCredentials: true,
        }),
      );
      this.org = {
        ...raw,
        id: raw.organizacionUUID ?? raw.id,
        razonSocial: raw.razonSocial ?? raw.razon_social ?? raw.nombre ?? '',
        rut: raw.dv ? `${raw.rut}-${raw.dv}` : raw.rut,
        tipo: raw.tipo ?? raw.tipo_participante ?? raw.tipoParticipante ?? raw.tipoParticipacion,
        logoUrl: raw.logoUrl ?? raw.logo_url ?? undefined,
        bannerUrl: raw.bannerUrl ?? raw.banner_url ?? undefined,
      } as OrgProfileData;
    } catch {
      this.error = 'No fue posible cargar el perfil de la organización.';
    } finally {
      this.loading = false;
    }
  }

  async loadGroups(): Promise<void> {
    this.loadingGroups = true;
    try {
      const { data: raw } = await firstValueFrom(
        this.http.get<{ status:number, message: string, data: WorkGroupRaw[] }>(`/api/bff/organizacion/${this.orgId}/grupos`, {
          withCredentials: true,
        }),
      );
      this.groups = (raw ?? []).map(g => ({
        id: g.grupoId,
        nombre: g.nombre,
        lider: {
          id: g.liderUuid,
          nombre: g.liderNombre,
          apellido: g.liderApellido,
          username: g.liderUuid,
        },
        miembros: g.miembros.map(m => ({
          id: m.miembroId,
          nombre: m.nombre,
          apellido: m.apellido,
          username: m.usuarioUuid,
          avatarUrl: m.avatarUrl ?? undefined,
          cargo: m.cargoEnGrupo,
        })),
        expanded: false,
      }));
    } catch {
      this.groups = [];
    } finally {
      this.loadingGroups = false;
    }
  }

  // ── Description ───────────────────────────────────────────────────────────────

  openEditDescription(): void {
    this.descriptionDraft = this.org?.descripcion ?? '';
    this.editingDescription = true;
    this.descriptionError = null;
  }

  cancelDescription(): void {
    this.editingDescription = false;
    this.descriptionError = null;
  }

  async saveDescription(): Promise<void> {
    if (!this.org) return;
    this.savingDescription = true;
    this.descriptionError = null;
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/bff/organizacion/${this.orgId}`,
          { descripcion: this.descriptionDraft },
          { withCredentials: true },
        ),
      );
      this.org = { ...this.org, descripcion: this.descriptionDraft };
      this.editingDescription = false;
    } catch {
      this.descriptionError = 'No fue posible guardar la descripción.';
    } finally {
      this.savingDescription = false;
    }
  }

  // ── Ecosistema digital ────────────────────────────────────────────────────────

  openAddLink(): void {
    this.editingLinkIndex = null;
    this.linkForm.reset({ tipo: 'WEBSITE', url: '' });
    this.showAddLinkForm = true;
    this.linkError = null;
  }

  openEditLink(index: number): void {
    if (!this.isAdmin) return;
    const link = this.org?.ecosistemaDigital?.[index];
    if (!link) return;
    this.editingLinkIndex = index;
    this.linkForm.setValue({ tipo: link.tipo, url: link.url });
    this.showAddLinkForm = true;
    this.linkError = null;
  }

  cancelLink(): void {
    this.showAddLinkForm = false;
    this.editingLinkIndex = null;
    this.linkError = null;
  }

  async saveLink(): Promise<void> {
    if (this.linkForm.invalid || !this.org) return;
    this.savingLink = true;
    this.linkError = null;
    const links: SocialLink[] = [...(this.org.ecosistemaDigital ?? [])];
    const newLink: SocialLink = this.linkForm.value as SocialLink;
    if (this.editingLinkIndex === null) {
      links.push(newLink);
    } else {
      links[this.editingLinkIndex] = newLink;
    }
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/bff/organizacion/${this.orgId}`,
          { ecosistemaDigital: links },
          { withCredentials: true },
        ),
      );
      this.org = { ...this.org, ecosistemaDigital: links };
      this.showAddLinkForm = false;
      this.editingLinkIndex = null;
    } catch {
      this.linkError = 'No fue posible guardar el enlace.';
    } finally {
      this.savingLink = false;
    }
  }

  async removeLink(index: number): Promise<void> {
    if (!this.org) return;
    const links = [...(this.org.ecosistemaDigital ?? [])];
    links.splice(index, 1);
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/bff/organizacion/${this.orgId}`,
          { ecosistemaDigital: links },
          { withCredentials: true },
        ),
      );
      this.org = { ...this.org, ecosistemaDigital: links };
    } catch {
      /* silently ignore — UI stays consistent */
    }
  }

  // ── Groups / leader change ────────────────────────────────────────────────────

  toggleGroup(group: WorkGroup): void {
    group.expanded = !group.expanded;
  }

  async openChangeLeader(group: WorkGroup): Promise<void> {
    group.changingLeader = true;
    group.selectedNewLeader = group.lider.id;
    if (!group.leaderCandidates) {
      try {
        const res = await firstValueFrom(
          this.http.get<GroupMember[]>(`/api/bff/organizacion/${this.orgId}/miembros`, {
            withCredentials: true,
          }),
        );
        group.leaderCandidates = res ?? [];
      } catch {
        group.leaderCandidates = [];
      }
    }
  }

  cancelChangeLeader(group: WorkGroup): void {
    group.changingLeader = false;
  }

  async saveNewLeader(group: WorkGroup): Promise<void> {
    if (!group.selectedNewLeader) return;
    group.savingLeader = true;
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/bff/organizacion/${this.orgId}/grupo/${group.id}/lider`,
          { liderId: group.selectedNewLeader },
          { withCredentials: true },
        ),
      );
      // optimistic: find new leader in candidates list and update local state
      const newLider = group.leaderCandidates?.find(m => m.id === group.selectedNewLeader);
      if (newLider) {
        const oldLider = { ...group.lider };
        group.lider = newLider;
        // move old leader back to members, remove new leader from members
        group.miembros = [
          ...group.miembros.filter(m => m.id !== newLider.id),
          oldLider,
        ];
      }
      group.changingLeader = false;
    } catch {
      /* keep form open so user can retry */
    } finally {
      group.savingLeader = false;
    }
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  /** Flat deduplicated list of all collaborators across all groups */
  get allCollaborators(): CollaboratorFlat[] {
    const seen = new Set<string>();
    const result: CollaboratorFlat[] = [];
    for (const g of this.groups) {
      for (const m of g.miembros) {
        if (!seen.has(m.username)) {
          seen.add(m.username);
          result.push({
            id: m.id,
            nombre: m.nombre,
            apellido: m.apellido,
            username: m.username,
            avatarUrl: m.avatarUrl,
            cargo: m.cargo,
            grupoNombre: g.nombre,
          });
        }
      }
    }
    return result;
  }

  goToMemberProfile(username: string): void {
    this.router.navigate(['contenedor', 'pages', 'u', username]);
  }

  onCollaboratorSelect(collab: CollaboratorFlat): void {
    if (collab.username) {
      this.goToMemberProfile(collab.username);
    }
  }

  goToGestor(): void {
    this.router.navigate(['contenedor', 'pages', 'organizaciones', this.orgId, 'gestor']);
  }

  // ── Banner / logo upload ──────────────────────────────────────────────────────

  async onBannerSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.org) return;
    if (file.size > 5 * 1024 * 1024) { input.value = ''; return; }
    this.uploadingBanner = true;
    try {
      const user = this.session.user();
      const { url } = await this.uploadService.getPresignedPutUrl(
        '',
        'ORG_BANNER',
        'org-banner',
        file.type,
        user?.id ?? '',
        this.orgId,
      );
      await this.uploadService.uploadToPresignedUrl(url, file);
      const currentOrg = this.org;
      if (!currentOrg) return;
      const reader = new FileReader();
      reader.onload = e => {
        this.org = { ...currentOrg, bannerUrl: e.target?.result as string };
      };
      reader.readAsDataURL(file);
    } catch {
      /* upload failed silently */
    } finally {
      this.uploadingBanner = false;
      input.value = '';
    }
  }

  async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !this.org) return;
    if (file.size > 5 * 1024 * 1024) { input.value = ''; return; }
    this.uploadingLogo = true;
    try {
      const user = this.session.user();
      const { url } = await this.uploadService.getPresignedPutUrl(
        '',
        'ORG_LOGO',
        'org-logo',
        file.type,
        user?.id ?? '',
        this.orgId,
      );
      await this.uploadService.uploadToPresignedUrl(url, file);
      const currentOrg = this.org;
      if (!currentOrg) return;
      const reader = new FileReader();
      reader.onload = e => {
        this.org = { ...currentOrg, logoUrl: e.target?.result as string };
      };
      reader.readAsDataURL(file);
    } catch {
      /* upload failed silently */
    } finally {
      this.uploadingLogo = false;
      input.value = '';
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  getInitials(name: string): string {
    return name
      .split(' ')
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
  }

  formatAddress(addr?: AddressData): string {
    if (!addr) return 'Dirección no registrada.';
    const parts = [addr.calle, addr.numero, addr.ciudad].filter(Boolean);
    return parts.join(' ') || 'Dirección no registrada.';
  }

  trackById(_index: number, item: { id: string | number }): string {
    return String(item.id);
  }
}
