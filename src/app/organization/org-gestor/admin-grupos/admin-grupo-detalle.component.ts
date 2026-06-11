import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GrupoTrabajo, GrupoMiembro, OrgMiembro } from '../org-gestor.component';
import { SearchableCardItem } from 'shared-utils';

@Component({
  selector: 'app-admin-grupo-detalle',
  templateUrl: './admin-grupo-detalle.component.html',
  styleUrls: ['./admin-grupo-detalle.component.scss'],
  standalone: false,
})
export class AdminGrupoDetalleComponent implements OnInit {

  orgId = '';
  grupoId = '';
  grupo: GrupoTrabajo | null = null;
  miembrosOrg: OrgMiembro[] = [];
  loading = true;
  error: string | null = null;

  // ── Add member ────────────────────────────────────────────────────────────
  showAddPanel = false;
  selectedUuid = '';
  cargo = '';
  adding = false;
  addError: string | null = null;

  // ── Remove member ─────────────────────────────────────────────────────────
  removingMiembro: GrupoMiembro | null = null;
  removing = false;
  removeError: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly http: HttpClient,
  ) { }

  async ngOnInit(): Promise<void> {
    // Parent route (:id/gestor) has :id, current (grupos/:grupoId) has :grupoId
    this.orgId   = this.route.parent?.snapshot.params['id'] as string ?? '';
    this.grupoId = this.route.snapshot.params['grupoId'] as string ?? '';
    await Promise.all([this.loadGrupo(), this.loadMiembrosOrg()]);
  }

  private async loadGrupo(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: GrupoTrabajo[] }>(
          `/api/bff/organizacion/${this.orgId}/grupos`,
          { withCredentials: true },
        ),
      );
      this.grupo = (res.data ?? []).find(g => g.grupoId === this.grupoId) ?? null;
      if (!this.grupo) this.error = 'Grupo no encontrado.';
    } catch {
      this.error = 'No se pudo cargar el grupo.';
    } finally {
      this.loading = false;
    }
  }

  private async loadMiembrosOrg(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: OrgMiembro[] }>(
          `/api/bff/organizacion/${this.orgId}/miembros`,
          { withCredentials: true },
        ),
      );
      this.miembrosOrg = res.data ?? [];
    } catch { /* silent */ }
  }

  get availableMiembros(): OrgMiembro[] {
    if (!this.grupo) return this.miembrosOrg;
    const inGroup = new Set(this.grupo.miembros.map(m => m.usuarioUuid));
    return this.miembrosOrg.filter(m => !inGroup.has(m.usuarioUuid));
  }

  get availableMiembrosAsItems(): SearchableCardItem[] {
    return this.availableMiembros.map(m => ({
      id: m.usuarioUuid,
      name: `${m.nombre} ${m.apellido}`,
      meta: m.rolNombre ?? undefined,
      avatarUrl: m.avatarUrl ?? undefined,
    }));
  }

  onMiembroSelected(item: SearchableCardItem): void {
    this.selectedUuid = item.id;
  }

  // ── Add ───────────────────────────────────────────────────────────────────

  async addMiembro(): Promise<void> {
    if (!this.selectedUuid) return;
    this.adding = true;
    this.addError = null;
    try {
      await firstValueFrom(
        this.http.post(
          `/api/bff/organizacion/grupos/${this.grupoId}/miembros`,
          { usuarioUuid: this.selectedUuid, cargoEnGrupo: this.cargo || undefined },
          { withCredentials: true },
        ),
      );
      const org = this.miembrosOrg.find(m => m.usuarioUuid === this.selectedUuid);
      if (org && this.grupo) {
        this.grupo.miembros.push({
          miembroId: '',
          usuarioUuid: org.usuarioUuid,
          nombre: org.nombre,
          apellido: org.apellido,
          avatarUrl: org.avatarUrl,
          cargoEnGrupo: this.cargo || null,
        });
      }
      this.selectedUuid = '';
      this.cargo = '';
      this.showAddPanel = false;
    } catch (err: any) {
      this.addError = err?.error?.message ?? 'No se pudo agregar al miembro.';
    } finally {
      this.adding = false;
    }
  }

  // ── Remove ────────────────────────────────────────────────────────────────

  openRemove(m: GrupoMiembro): void {
    this.removingMiembro = m;
    this.removeError = null;
  }

  async confirmRemove(): Promise<void> {
    if (!this.removingMiembro || !this.grupo) return;
    this.removing = true;
    this.removeError = null;
    try {
      await firstValueFrom(
        this.http.delete(
          `/api/bff/organizacion/grupos/${this.grupoId}/miembros/${this.removingMiembro.usuarioUuid}`,
          { withCredentials: true },
        ),
      );
      this.grupo.miembros = this.grupo.miembros.filter(
        m => m.usuarioUuid !== this.removingMiembro!.usuarioUuid,
      );
      this.removingMiembro = null;
    } catch {
      this.removeError = 'No se pudo remover al miembro.';
    } finally {
      this.removing = false;
    }
  }

  goBack(): void {
    this.router.navigate(['../'], { relativeTo: this.route });
  }

  isLider(m: GrupoMiembro): boolean {
    return this.grupo?.liderUuid === m.usuarioUuid;
  }
}
