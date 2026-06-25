import { Component, OnInit, effect } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { OrgMiembro, OrgAdminRol } from '../org-gestor.component';
import { UserStateService } from 'shared-utils';

const ROL_OPTS: { codigo: OrgAdminRol; label: string }[] = [
  { codigo: 'ADMIN',       label: 'Administrador' },
  { codigo: 'OPERADOR',    label: 'Operador' },
  { codigo: 'COLABORADOR', label: 'Colaborador' },
  { codigo: 'AUDITOR',     label: 'Auditor' },
];

@Component({
  selector: 'app-admin-miembros',
  templateUrl: './admin-miembros.component.html',
  styleUrls: ['./admin-miembros.component.scss'],
  standalone: false,
})
export class AdminMiembrosComponent implements OnInit {

  orgId = '';
  miembros: OrgMiembro[] = [];
  loading = true;
  error: string | null = null;
  readonly ROL_OPTS = ROL_OPTS;

  // ── Role change ───────────────────────────────────────────────────────────
  changingRol: OrgMiembro | null = null;
  newRol: OrgAdminRol = 'COLABORADOR';
  savingRol = false;
  rolError: string | null = null;

  // ── Remove member ─────────────────────────────────────────────────────────
  removingMiembro: OrgMiembro | null = null;
  confirmingRemove = false;
  removing = false;
  removeError: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly userState: UserStateService,
  ) {
    effect(() => {
      const selectedOrgId = this.userState.orgSelected();
      if (!selectedOrgId || selectedOrgId === this.orgId) return;
      this.orgId = selectedOrgId;
      this.load();
    });
  }

  async ngOnInit(): Promise<void> {
    this.orgId = this.route.parent?.snapshot.params['id'] as string || this.userState.orgSelected() || '';
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: OrgMiembro[] }>(`/api/bff/organizacion/${this.orgId}/miembros`, {
          withCredentials: true,
        }),
      );
      this.miembros = res.data ?? [];
    } catch {
      this.error = 'No se pudieron cargar los miembros.';
    } finally {
      this.loading = false;
    }
  }

  // ── Role ──────────────────────────────────────────────────────────────────

  openChangeRol(m: OrgMiembro): void {
    this.changingRol = m;
    this.newRol = m.rolCodigo;
    this.rolError = null;
  }

  async saveRol(): Promise<void> {
    if (!this.changingRol) return;
    this.savingRol = true;
    this.rolError = null;
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/bff/organizacion/${this.orgId}/miembros/${this.changingRol.usuarioUuid}/rol`,
          { rolCodigo: this.newRol },
          { withCredentials: true },
        ),
      );
      this.changingRol.rolCodigo = this.newRol;
      this.changingRol.rolNombre = ROL_OPTS.find(r => r.codigo === this.newRol)?.label ?? this.newRol;
      this.changingRol = null;
    } catch {
      this.rolError = 'No se pudo cambiar el rol.';
    } finally {
      this.savingRol = false;
    }
  }

  // ── Remove ────────────────────────────────────────────────────────────────

  openRemove(m: OrgMiembro): void {
    this.removingMiembro = m;
    this.confirmingRemove = false;
    this.removeError = null;
  }

  async confirmRemove(): Promise<void> {
    if (!this.removingMiembro) return;
    this.removing = true;
    this.removeError = null;
    try {
      await firstValueFrom(
        this.http.delete(
          `/api/bff/organizacion/${this.orgId}/miembros/${this.removingMiembro.usuarioUuid}`,
          { withCredentials: true },
        ),
      );
      this.miembros = this.miembros.filter(m => m.usuarioUuid !== this.removingMiembro!.usuarioUuid);
      this.removingMiembro = null;
    } catch {
      this.removeError = 'No se pudo remover al miembro.';
    } finally {
      this.removing = false;
    }
  }

  rolClass(rol: OrgAdminRol): string {
    return `rol-chip rol-chip--${rol.toLowerCase()}`;
  }
}
