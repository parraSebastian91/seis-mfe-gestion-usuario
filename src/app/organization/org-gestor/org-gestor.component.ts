import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ObjectUploadService, SessionService } from 'shared-utils';

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface OrgMember {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl?: string;
  email?: string;
  rolEnOrg: 'admin' | 'miembro';
  esCreador: boolean;
}

export interface PendingRequest {
  id: string;
  userId: string;
  username: string;
  nombre: string;
  apellido: string;
  avatarUrl?: string;
  solicitadoEn: string;
}

export interface SentInvitation {
  id: string;
  email: string;
  enviadaEn: string;
  expiraEn: string;
}

export interface GestorWorkGroup {
  id: string;
  nombre: string;
  liderId: string;
  liderNombre: string;
  liderAvatarUrl?: string;
  miembros: { id: string; nombre: string; apellido: string; avatarUrl?: string }[];
  expanded?: boolean;
}

type LinkTipo = 'LINKEDIN' | 'TWITTER' | 'WEBSITE' | 'OTRO';

interface EcosistemaLink {
  tipo: LinkTipo;
  url: string;
}

export interface OrgGestorData {
  id: string;
  razonSocial: string;
  descripcion?: string;
  logoUrl?: string;
  bannerUrl?: string;
  codigoAcceso?: string;
  ecosistemaDigital?: EcosistemaLink[];
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const LINK_TIPO_OPTS: LinkTipo[] = ['LINKEDIN', 'TWITTER', 'WEBSITE', 'OTRO'];

export const LINK_TIPO_LABELS: Record<LinkTipo, string> = {
  LINKEDIN: 'LinkedIn',
  TWITTER: 'Twitter / X',
  WEBSITE: 'Sitio web',
  OTRO: 'Otro',
};

// ── Component ──────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-org-gestor',
  templateUrl: './org-gestor.component.html',
  styleUrls: ['./org-gestor.component.scss'],
  standalone: false,
})
export class OrgGestorComponent implements OnInit {
  // Forms (readonly: reference never reassigned)
  readonly createUserForm: FormGroup;
  readonly groupForm: FormGroup;
  readonly configForm: FormGroup;
  readonly configLinkForm: FormGroup;

  // Exposed constants for template
  readonly LINK_TIPO_OPTS = LINK_TIPO_OPTS;
  readonly LINK_TIPO_LABELS = LINK_TIPO_LABELS;
  readonly TAB_HASHES = ['#miembros', '#grupos', '#configuracion'];

  // ── Core state ───────────────────────────────────────────────────────────────
  orgId = '';
  org: OrgGestorData | null = null;
  loading = true;
  generalError: string | null = null;

  // ── Active tab ───────────────────────────────────────────────────────────────
  activeTab = 0;

  // ── Members state ────────────────────────────────────────────────────────────
  members: OrgMember[] = [];
  pendingRequests: PendingRequest[] = [];
  sentInvitations: SentInvitation[] = [];
  loadingMembers = false;

  // Member actions
  actionTarget: OrgMember | null = null;
  showPromoteConfirm = false;
  showDemoteConfirm = false;
  demoteBlockedSelfLast = false;
  showRemoveConfirm = false;
  removeReason = '';
  confirmingAction = false;
  actionError: string | null = null;

  // Requests
  rejectingRequest: PendingRequest | null = null;
  rejectReason = '';
  confirmingRequest = false;

  // Invitations
  showInviteForm = false;
  inviteEmail = '';
  inviteEmailError: string | null = null;
  sendingInvite = false;
  revokingInvitationId: string | null = null;
  confirmingRevoke = false;

  // Create user modal
  showCreateUserModal = false;
  creatingUser = false;
  createUserError: string | null = null;

  // ── Groups state ─────────────────────────────────────────────────────────────
  grupos: GestorWorkGroup[] = [];
  loadingGroups = false;
  showGroupModal = false;
  editingGroup: GestorWorkGroup | null = null;
  savingGroup = false;
  groupError: string | null = null;
  deletingGroup: GestorWorkGroup | null = null;
  confirmingDeleteGroup = false;

  // ── Config state ─────────────────────────────────────────────────────────────
  savingConfig = false;
  configError: string | null = null;
  uploadingBanner = false;
  uploadingLogo = false;

  // Ecosistema digital (config tab)
  showConfigLinkAdd = false;
  editingConfigLinkIndex: number | null = null;
  savingConfigLink = false;
  configLinkError: string | null = null;

  // Code rotation
  showCodeRotateConfirm = false;
  rotatingCode = false;

  // Danger zone
  showDeactivateModal = false;
  deactivateConfirmText = '';
  deactivating = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly fb: FormBuilder,
    readonly session: SessionService,
    private readonly uploadService: ObjectUploadService,
  ) {
    this.createUserForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(2)]],
      apellido: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
    });

    this.groupForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.maxLength(100)]],
      liderId: ['', Validators.required],
      miembrosIds: [[]],
    });

    this.configForm = this.fb.group({
      razonSocial: ['', [Validators.required, Validators.minLength(2)]],
      descripcion: [''],
    });

    this.configLinkForm = this.fb.group({
      tipo: ['WEBSITE', Validators.required],
      url: ['', [Validators.required, Validators.pattern(/^https:\/\/.+/)]],
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    this.orgId = this.route.snapshot.params['id'] as string ?? '';
    this.activeTab = this.getTabFromHash();
    await this.verifyAdminAccess();
  }

  private getTabFromHash(): number {
    const hash = globalThis.location.hash;
    const idx = this.TAB_HASHES.indexOf(hash);
    return Math.max(idx, 0);
  }

  onTabChange(index: number): void {
    this.activeTab = index;
    const newUrl = `${globalThis.location.pathname}${this.TAB_HASHES[index]}`;
    globalThis.history.replaceState({}, '', newUrl);
  }

  // ── Access guard ──────────────────────────────────────────────────────────────

  private async verifyAdminAccess(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.http.get<{ rol: string }>(`/api/core/organizacion/${this.orgId}/mi-rol`, {
          withCredentials: true,
        }),
      );
      if (result.rol !== 'admin') {
        await this.router.navigate(['contenedor', 'pages', 'organizaciones', this.orgId]);
        return;
      }
      await this.loadAll();
    } catch {
      await this.router.navigate(['contenedor', 'pages', 'organizaciones', this.orgId]);
    }
  }

  private async loadAll(): Promise<void> {
    this.loading = true;
    try {
      await Promise.all([this.loadOrg(), this.loadMembers(), this.loadGroups()]);
    } catch {
      this.generalError = 'No fue posible cargar los datos de la organización.';
    } finally {
      this.loading = false;
    }
  }

  private async loadOrg(): Promise<void> {
    const org = await firstValueFrom(
      this.http.get<OrgGestorData>(`/api/core/organizacion/${this.orgId}`, {
        withCredentials: true,
      }),
    );
    this.org = org;
    this.configForm.patchValue({
      razonSocial: org.razonSocial,
      descripcion: org.descripcion ?? '',
    });
  }

  async loadMembers(): Promise<void> {
    this.loadingMembers = true;
    try {
      const [members, requests, invitations] = await Promise.all([
        firstValueFrom(
          this.http.get<OrgMember[]>(`/api/core/organizacion/${this.orgId}/miembros`, {
            withCredentials: true,
          }),
        ),
        firstValueFrom(
          this.http.get<PendingRequest[]>(
            `/api/core/organizacion/${this.orgId}/miembro/solicitudes`,
            { withCredentials: true },
          ),
        ),
        firstValueFrom(
          this.http.get<SentInvitation[]>(`/api/core/organizacion/${this.orgId}/invitaciones`, {
            withCredentials: true,
          }),
        ),
      ]);
      this.members = members ?? [];
      this.pendingRequests = requests ?? [];
      this.sentInvitations = invitations ?? [];
    } finally {
      this.loadingMembers = false;
    }
  }

  async loadGroups(): Promise<void> {
    this.loadingGroups = true;
    try {
      const res = await firstValueFrom(
        this.http.get<GestorWorkGroup[]>(`/api/core/organizacion/${this.orgId}/grupos`, {
          withCredentials: true,
        }),
      );
      this.grupos = (res ?? []).map(g => ({ ...g, expanded: false }));
    } finally {
      this.loadingGroups = false;
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────────

  get adminCount(): number {
    return this.members.filter(m => m.rolEnOrg === 'admin').length;
  }

  get isOwner(): boolean {
    const user = this.session.user();
    if (!user) return false;
    return this.members.some(m => m.username === (user as { username?: string }).username && m.esCreador);
  }

  get canConfirmDeactivate(): boolean {
    return !!this.org && this.deactivateConfirmText === this.org.razonSocial;
  }

  // ── Navigation ────────────────────────────────────────────────────────────────

  goBack(): void {
    this.router.navigate(['contenedor', 'pages', 'organizaciones', this.orgId]);
  }

  goToUserProfile(username: string): void {
    const url = this.router.serializeUrl(
      this.router.createUrlTree(['contenedor', 'pages', 'u', username]),
    );
    globalThis.open(url, '_blank');
  }

  // ── CA-03: Member role management ─────────────────────────────────────────────

  openPromote(member: OrgMember): void {
    this.actionTarget = member;
    this.actionError = null;
    this.showPromoteConfirm = true;
  }

  openDemote(member: OrgMember): void {
    this.actionError = null;
    if (this.adminCount <= 1) {
      this.demoteBlockedSelfLast = true;
      this.actionTarget = member;
      this.showDemoteConfirm = true;
      return;
    }
    this.demoteBlockedSelfLast = false;
    this.actionTarget = member;
    this.showDemoteConfirm = true;
  }

  openRemove(member: OrgMember): void {
    this.actionTarget = member;
    this.removeReason = '';
    this.actionError = null;
    this.showRemoveConfirm = true;
  }

  cancelAction(): void {
    this.actionTarget = null;
    this.showPromoteConfirm = false;
    this.showDemoteConfirm = false;
    this.showRemoveConfirm = false;
    this.removeReason = '';
    this.actionError = null;
    this.demoteBlockedSelfLast = false;
  }

  async confirmPromote(): Promise<void> {
    if (!this.actionTarget) return;
    this.confirmingAction = true;
    this.actionError = null;
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/core/organizacion/${this.orgId}/miembro/${this.actionTarget.id}/rol`,
          { rol: 'admin' },
          { withCredentials: true },
        ),
      );
      this.cancelAction();
      await this.loadMembers();
    } catch {
      this.actionError = 'No fue posible promover al miembro. Intenta nuevamente.';
    } finally {
      this.confirmingAction = false;
    }
  }

  async confirmDemote(): Promise<void> {
    if (!this.actionTarget || this.demoteBlockedSelfLast) return;
    this.confirmingAction = true;
    this.actionError = null;
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/core/organizacion/${this.orgId}/miembro/${this.actionTarget.id}/rol`,
          { rol: 'miembro' },
          { withCredentials: true },
        ),
      );
      this.cancelAction();
      await this.loadMembers();
    } catch {
      this.actionError = 'No fue posible degradar al miembro. Intenta nuevamente.';
    } finally {
      this.confirmingAction = false;
    }
  }

  async confirmRemove(): Promise<void> {
    if (!this.actionTarget) return;
    this.confirmingAction = true;
    this.actionError = null;
    try {
      await firstValueFrom(
        this.http.delete(
          `/api/core/organizacion/${this.orgId}/miembro/${this.actionTarget.id}`,
          {
            body: { motivo: this.removeReason },
            withCredentials: true,
          },
        ),
      );
      this.cancelAction();
      await this.loadMembers();
    } catch {
      this.actionError = 'No fue posible remover al miembro. Intenta nuevamente.';
    } finally {
      this.confirmingAction = false;
    }
  }

  // ── CA-04: Pending requests ───────────────────────────────────────────────────

  async approveRequest(req: PendingRequest): Promise<void> {
    this.confirmingRequest = true;
    try {
      await firstValueFrom(
        this.http.post(
          `/api/core/organizacion/${this.orgId}/miembro/solicitud/${req.id}/aprobar`,
          {},
          { withCredentials: true },
        ),
      );
      await this.loadMembers();
    } finally {
      this.confirmingRequest = false;
    }
  }

  showRejectForm(req: PendingRequest): void {
    this.rejectingRequest = req;
    this.rejectReason = '';
  }

  cancelReject(): void {
    this.rejectingRequest = null;
    this.rejectReason = '';
  }

  async confirmReject(): Promise<void> {
    if (!this.rejectingRequest) return;
    this.confirmingRequest = true;
    try {
      await firstValueFrom(
        this.http.post(
          `/api/core/organizacion/${this.orgId}/miembro/solicitud/${this.rejectingRequest.id}/rechazar`,
          { motivo: this.rejectReason },
          { withCredentials: true },
        ),
      );
      this.cancelReject();
      await this.loadMembers();
    } finally {
      this.confirmingRequest = false;
    }
  }

  // ── CA-05: Invitations ────────────────────────────────────────────────────────

  toggleInviteForm(): void {
    this.showInviteForm = !this.showInviteForm;
    if (!this.showInviteForm) {
      this.inviteEmail = '';
      this.inviteEmailError = null;
    }
  }

  async sendInvitation(): Promise<void> {
    this.inviteEmailError = null;
    if (!this.inviteEmail) return;
    // EB-02: validate not already a member
    const emailLower = this.inviteEmail.toLowerCase();
    const alreadyMember = this.members.some(
      m => (m.email ?? '').toLowerCase() === emailLower,
    );
    if (alreadyMember) {
      this.inviteEmailError = 'Este correo ya pertenece a un miembro activo de la organización.';
      return;
    }
    this.sendingInvite = true;
    try {
      await firstValueFrom(
        this.http.post(
          `/api/core/organizacion/${this.orgId}/invitacion`,
          { email: this.inviteEmail },
          { withCredentials: true },
        ),
      );
      this.inviteEmail = '';
      this.showInviteForm = false;
      await this.loadMembers();
    } catch {
      this.inviteEmailError = 'No fue posible enviar la invitación. Intenta nuevamente.';
    } finally {
      this.sendingInvite = false;
    }
  }

  async resendInvitation(inv: SentInvitation): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(
          `/api/core/organizacion/${this.orgId}/invitacion/${inv.id}/reenviar`,
          {},
          { withCredentials: true },
        ),
      );
      await this.loadMembers();
    } catch {
      /* silently ignore, UI stays consistent */
    }
  }

  openRevokeConfirm(invId: string): void {
    this.revokingInvitationId = invId;
  }

  cancelRevoke(): void {
    this.revokingInvitationId = null;
  }

  async confirmRevoke(): Promise<void> {
    if (!this.revokingInvitationId) return;
    this.confirmingRevoke = true;
    try {
      await firstValueFrom(
        this.http.delete(`/api/core/organizacion/${this.orgId}/invitacion/${this.revokingInvitationId}`, {
          withCredentials: true,
        }),
      );
      this.revokingInvitationId = null;
      await this.loadMembers();
    } finally {
      this.confirmingRevoke = false;
    }
  }

  // ── CA-06: Create user ────────────────────────────────────────────────────────

  openCreateUser(): void {
    this.createUserForm.reset();
    this.createUserError = null;
    this.showCreateUserModal = true;
  }

  closeCreateUser(): void {
    this.showCreateUserModal = false;
    this.createUserForm.reset();
    this.createUserError = null;
  }

  async createUser(): Promise<void> {
    if (this.createUserForm.invalid) return;
    this.creatingUser = true;
    this.createUserError = null;
    try {
      const { nombre, apellido, email } = this.createUserForm.value as {
        nombre: string;
        apellido: string;
        email: string;
      };
      await firstValueFrom(
        this.http.post(
          '/api/auth/security/crear-usuario',
          { nombre, apellido, email, orgId: this.orgId },
          { withCredentials: true },
        ),
      );
      this.closeCreateUser();
      await this.loadMembers();
    } catch {
      this.createUserError = 'No fue posible crear el usuario. Intenta nuevamente.';
    } finally {
      this.creatingUser = false;
    }
  }

  // ── CA-07/08: Work groups ─────────────────────────────────────────────────────

  openNewGroup(): void {
    this.editingGroup = null;
    this.groupForm.reset({ nombre: '', liderId: '', miembrosIds: [] });
    this.groupError = null;
    this.showGroupModal = true;
  }

  openEditGroup(grupo: GestorWorkGroup): void {
    this.editingGroup = grupo;
    this.groupForm.setValue({
      nombre: grupo.nombre,
      liderId: grupo.liderId,
      miembrosIds: grupo.miembros.map(m => m.id),
    });
    this.groupError = null;
    this.showGroupModal = true;
  }

  closeGroupModal(): void {
    this.showGroupModal = false;
    this.editingGroup = null;
    this.groupForm.reset();
    this.groupError = null;
  }

  async saveGroup(): Promise<void> {
    if (this.groupForm.invalid) return;
    this.savingGroup = true;
    this.groupError = null;
    const payload = this.groupForm.value as {
      nombre: string;
      liderId: string;
      miembrosIds: string[];
    };
    try {
      if (this.editingGroup) {
        await firstValueFrom(
          this.http.patch(
            `/api/core/organizacion/${this.orgId}/grupo/${this.editingGroup.id}`,
            payload,
            { withCredentials: true },
          ),
        );
      } else {
        await firstValueFrom(
          this.http.post(
            `/api/core/organizacion/${this.orgId}/grupo`,
            payload,
            { withCredentials: true },
          ),
        );
      }
      this.closeGroupModal();
      await this.loadGroups();
    } catch {
      this.groupError = 'No fue posible guardar el grupo. Intenta nuevamente.';
    } finally {
      this.savingGroup = false;
    }
  }

  openDeleteGroup(grupo: GestorWorkGroup): void {
    this.deletingGroup = grupo;
  }

  cancelDeleteGroup(): void {
    this.deletingGroup = null;
  }

  async confirmDeleteGroup(): Promise<void> {
    if (!this.deletingGroup) return;
    this.confirmingDeleteGroup = true;
    try {
      await firstValueFrom(
        this.http.delete(`/api/core/organizacion/${this.orgId}/grupo/${this.deletingGroup.id}`, {
          withCredentials: true,
        }),
      );
      this.deletingGroup = null;
      await this.loadGroups();
    } finally {
      this.confirmingDeleteGroup = false;
    }
  }

  // ── CA-09: Configuration ──────────────────────────────────────────────────────

  async saveOrgInfo(): Promise<void> {
    if (this.configForm.invalid) return;
    this.savingConfig = true;
    this.configError = null;
    try {
      const { razonSocial, descripcion } = this.configForm.value as {
        razonSocial: string;
        descripcion: string;
      };
      await firstValueFrom(
        this.http.patch(
          `/api/core/organizacion/${this.orgId}`,
          { razonSocial, descripcion },
          { withCredentials: true },
        ),
      );
      if (this.org) {
        this.org = { ...this.org, razonSocial, descripcion };
        const activeOrg = this.session.activeOrg();
        const currentUser = this.session.user();
        if (activeOrg && currentUser) {
          this.session.setSession(currentUser, { ...activeOrg, razonSocial });
        }
      }
    } catch {
      this.configError = 'No fue posible guardar los cambios. Intenta nuevamente.';
    } finally {
      this.savingConfig = false;
    }
  }

  async onConfigBannerSelected(event: Event): Promise<void> {
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
        (user as { id?: string })?.id ?? '',
        this.orgId,
      );
      await this.uploadService.uploadToPresignedUrl(url, file);
      const reader = new FileReader();
      reader.onload = e => {
        this.org = { ...this.org, bannerUrl: e.target?.result as string };
      };
      reader.readAsDataURL(file);
    } catch {
      /* silently ignore */
    } finally {
      this.uploadingBanner = false;
      input.value = '';
    }
  }

  async onConfigLogoSelected(event: Event): Promise<void> {
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
        (user as { id?: string })?.id ?? '',
        this.orgId,
      );
      await this.uploadService.uploadToPresignedUrl(url, file);
      const reader = new FileReader();
      reader.onload = e => {
        this.org = { ...this.org, logoUrl: e.target?.result as string };
      };
      reader.readAsDataURL(file);
    } catch {
      /* silently ignore */
    } finally {
      this.uploadingLogo = false;
      input.value = '';
    }
  }

  // Ecosistema digital (config tab)

  openConfigAddLink(): void {
    this.editingConfigLinkIndex = null;
    this.configLinkForm.reset({ tipo: 'WEBSITE', url: '' });
    this.configLinkError = null;
    this.showConfigLinkAdd = true;
  }

  openConfigEditLink(index: number): void {
    const link = this.org?.ecosistemaDigital?.[index];
    if (!link) return;
    this.editingConfigLinkIndex = index;
    this.configLinkForm.setValue({ tipo: link.tipo, url: link.url });
    this.configLinkError = null;
    this.showConfigLinkAdd = true;
  }

  cancelConfigLink(): void {
    this.showConfigLinkAdd = false;
    this.editingConfigLinkIndex = null;
    this.configLinkError = null;
  }

  async saveConfigLink(): Promise<void> {
    if (this.configLinkForm.invalid || !this.org) return;
    this.savingConfigLink = true;
    this.configLinkError = null;
    const links: EcosistemaLink[] = [...(this.org.ecosistemaDigital ?? [])];
    const newLink = this.configLinkForm.value as EcosistemaLink;
    if (this.editingConfigLinkIndex === null) {
      links.push(newLink);
    } else {
      links[this.editingConfigLinkIndex] = newLink;
    }
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/core/organizacion/${this.orgId}`,
          { ecosistemaDigital: links },
          { withCredentials: true },
        ),
      );
      this.org = { ...this.org, ecosistemaDigital: links };
      this.showConfigLinkAdd = false;
      this.editingConfigLinkIndex = null;
    } catch {
      this.configLinkError = 'No fue posible guardar el enlace.';
    } finally {
      this.savingConfigLink = false;
    }
  }

  async removeConfigLink(index: number): Promise<void> {
    if (!this.org) return;
    const links = [...(this.org.ecosistemaDigital ?? [])];
    links.splice(index, 1);
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/core/organizacion/${this.orgId}`,
          { ecosistemaDigital: links },
          { withCredentials: true },
        ),
      );
      this.org = { ...this.org, ecosistemaDigital: links };
    } catch {
      /* silently ignore */
    }
  }

  // Code rotation

  openRotateCode(): void {
    this.showCodeRotateConfirm = true;
  }

  cancelRotateCode(): void {
    this.showCodeRotateConfirm = false;
  }

  async rotateCode(): Promise<void> {
    this.rotatingCode = true;
    try {
      const result = await firstValueFrom(
        this.http.post<{ codigoAcceso: string }>(
          `/api/core/organizacion/${this.orgId}/rotar-codigo`,
          {},
          { withCredentials: true },
        ),
      );
      if (this.org) {
        this.org = { ...this.org, codigoAcceso: result.codigoAcceso };
      }
      this.showCodeRotateConfirm = false;
    } catch {
      /* keep confirm open for retry */
    } finally {
      this.rotatingCode = false;
    }
  }

  // Danger zone

  openDeactivateModal(): void {
    this.deactivateConfirmText = '';
    this.showDeactivateModal = true;
  }

  closeDeactivateModal(): void {
    this.showDeactivateModal = false;
    this.deactivateConfirmText = '';
  }

  async deactivateOrg(): Promise<void> {
    if (!this.canConfirmDeactivate) return;
    this.deactivating = true;
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/core/organizacion/${this.orgId}`,
          { estado: 'INACTIVA' },
          { withCredentials: true },
        ),
      );
      this.session.clearSession();
      await this.router.navigate(['contenedor', 'pages', 'organizaciones']);
    } finally {
      this.deactivating = false;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  getInitials(nombre: string, apellido: string): string {
    return `${nombre.charAt(0)}${apellido.charAt(0)}`.toUpperCase();
  }

  formatRole(rol: 'admin' | 'miembro'): string {
    if (rol === 'admin') return 'admin';
    return 'miembro';
  }

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }

  trackByEmail(_index: number, item: SentInvitation): string {
    return item.id;
  }
}
