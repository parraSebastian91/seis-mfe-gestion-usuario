import { Component, effect, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SolicitudAcceso } from '../org-gestor.component';
import { UserStateService } from 'shared-utils';

@Component({
  selector: 'app-admin-solicitudes',
  templateUrl: './admin-solicitudes.component.html',
  styleUrls: ['./admin-solicitudes.component.scss'],
  standalone: false,
})
export class AdminSolicitudesComponent implements OnInit {

  orgId = '';
  solicitudes: SolicitudAcceso[] = [];
  loading = true;
  error: string | null = null;

  // ── Resolve modal ─────────────────────────────────────────────────────────
  resolviendo: SolicitudAcceso | null = null;
  decision: 'APROBADA' | 'RECHAZADA' = 'APROBADA';
  motivoRechazo = '';
  saving = false;
  saveError: string | null = null;

  // ── Enrollment token ──────────────────────────────────────────────────────
  showTokenPanel = false;
  adminUuid = '';
  rolDestino = 'COLABORADOR';
  generatingToken = false;
  generatedToken: string | null = null;
  tokenExpira: string | null = null;
  tokenError: string | null = null;

  readonly ROL_OPTS = ['COLABORADOR', 'OPERADOR', 'AUDITOR'];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly userStateService: UserStateService,
  ) {
    effect(() => {
      const selectedOrgId = this.userStateService.orgSelected();
      if (!selectedOrgId || selectedOrgId === this.orgId) return;
      this.orgId = selectedOrgId;
      this.load();
    });
  }

  async ngOnInit(): Promise<void> {
    this.orgId = this.route.parent?.snapshot.params['id'] as string || this.userStateService.orgSelected() || '';
    this.adminUuid = this.userStateService.state().id;
    await this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: SolicitudAcceso[] }>(
          `/api/bff/organizacion/${this.orgId}/solicitudes-acceso?estado=PENDIENTE`,
          { withCredentials: true },
        ),
      );
      this.solicitudes = res.data ?? [];
    } catch {
      this.error = 'No se pudieron cargar las solicitudes.';
    } finally {
      this.loading = false;
    }
  }

  get pendingCount(): number {
    return this.solicitudes.filter(s => s.estado === 'PENDIENTE' && !s.estaExpirada).length;
  }

  // ── Resolve ───────────────────────────────────────────────────────────────

  openResolve(s: SolicitudAcceso, d: 'APROBADA' | 'RECHAZADA'): void {
    this.resolviendo = s;
    this.decision = d;
    this.motivoRechazo = '';
    this.saveError = null;
  }

  async confirmResolve(): Promise<void> {
    if (!this.resolviendo) return;
    if (this.decision === 'RECHAZADA' && !this.motivoRechazo.trim()) {
      this.saveError = 'El motivo de rechazo es requerido.';
      return;
    }
    this.saving = true;
    this.saveError = null;
    try {
      await firstValueFrom(
        this.http.post(
          `/api/bff/organizacion/solicitud-acceso/${this.resolviendo.token}/resolver`,
          {
            adminUuid: this.adminUuid,
            decision: this.decision,
            motivoRechazo: this.motivoRechazo || undefined,
          },
          { withCredentials: true },
        ),
      );
      this.solicitudes = this.solicitudes.filter(s => s.solicitudId !== this.resolviendo!.solicitudId);
      this.resolviendo = null;
    } catch (err: any) {
      this.saveError = err?.error?.message ?? 'No se pudo procesar la solicitud.';
    } finally {
      this.saving = false;
    }
  }

  // ── Token de enrolamiento ─────────────────────────────────────────────────

  openTokenPanel(): void {
    this.showTokenPanel = true;
    this.generatedToken = null;
    this.tokenExpira = null;
    this.tokenError = null;
  }

  async generateToken(): Promise<void> {
    this.generatingToken = true;
    this.tokenError = null;
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: { token: string; expiraEn: string } }>(
          `/api/bff/organizacion/${this.orgId}/generar-token-enrolamiento`,
          { adminUuid: this.adminUuid, rolDestino: this.rolDestino },
          { withCredentials: true },
        ),
      );
      this.generatedToken = res.data.token;
      this.tokenExpira = res.data.expiraEn;
    } catch {
      this.tokenError = 'No se pudo generar el token.';
    } finally {
      this.generatingToken = false;
    }
  }

  copyToken(): void {
    if (this.generatedToken) {
      navigator.clipboard.writeText(this.generatedToken);
    }
  }

  estadoClass(s: SolicitudAcceso): string {
    if (s.estaExpirada) return 'badge badge--expired';
    switch (s.estado) {
      case 'PENDIENTE':  return 'badge badge--pending';
      case 'APROBADA':   return 'badge badge--approved';
      case 'RECHAZADA':  return 'badge badge--rejected';
      default:           return 'badge badge--default';
    }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('es-CL', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }
}
