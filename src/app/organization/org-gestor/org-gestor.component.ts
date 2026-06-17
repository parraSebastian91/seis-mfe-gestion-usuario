import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

// ── Shared types re-exported so child components can import from here ──────────

export interface OrgGestorData {
  id: string;
  razonSocial: string;
  descripcion?: string;
  logoUrl?: string;
}

export type OrgAdminRol = 'ADMIN' | 'OPERADOR' | 'COLABORADOR' | 'AUDITOR';

export interface OrgMiembro {
  miembroId: number;
  usuarioUuid: string;
  nombre: string;
  apellido: string;
  email: string;
  avatarUrl: string | null;
  rolCodigo: OrgAdminRol;
  rolNombre: string;
  incorporadoEn: string;
}

export interface SolicitudAcceso {
  solicitudId: number;
  solicitanteUuid: string;
  solicitanteNombre: string;
  solicitanteApellido: string;
  solicitanteEmail: string;
  rolSolicitado: string;
  mensaje: string | null;
  token: string;
  estado: string;
  creadoEn: string;
  expiraEn: string;
  estaExpirada: boolean;
}

export interface GrupoMiembro {
  miembroId: string;
  usuarioUuid: string;
  nombre: string;
  apellido: string;
  avatarUrl: string | null;
  cargoEnGrupo: string | null;
}

export interface GrupoTrabajo {
  grupoId: string;
  nombre: string;
  descripcion: string | null;
  liderUuid: string;
  liderNombre: string;
  liderApellido: string;
  activo: boolean;
  creadoEn: string;
  miembros: GrupoMiembro[];
}

// ── Shell Component ────────────────────────────────────────────────────────────

@Component({
  selector: 'app-org-gestor',
  templateUrl: './org-gestor.component.html',
  styleUrls: ['./org-gestor.component.scss'],
  standalone: false,
})
export class OrgGestorComponent implements OnInit {

  orgId = '';
  org: OrgGestorData | null = null;
  loading = true;
  generalError: string | null = null;

  readonly navItems = [
    { path: 'miembros',      label: 'Miembros',      icon: 'group'        },
    { path: 'solicitudes',   label: 'Solicitudes',   icon: 'person_add'   },
    { path: 'grupos',        label: 'Grupos',        icon: 'workspaces'   },
    { path: 'organizacion',  label: 'Organización',  icon: 'settings'     },
  ] as const;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly http: HttpClient,
  ) { }

  async ngOnInit(): Promise<void> {
    this.orgId = this.route.snapshot.params['id'] as string ?? '';
    await this.verifyAdminAccess();
  }

  private async verifyAdminAccess(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`/api/bff/organizacion/${this.orgId}/mi-rol`, {
          withCredentials: true,
        }),
      );
      // BFF wraps in ApiResponse — unwrap
      const rol: string | null = response?.data?.rol ?? response?.rol ?? null;
      if (!rol || (rol.toUpperCase() !== 'ADMIN')) {
        await this.router.navigate(['contenedor', 'pages', 'organizaciones', this.orgId]);
        return;
      }
      await this.loadOrg();
    } catch {
      await this.router.navigate(['contenedor', 'pages', 'organizaciones', this.orgId]);
    }
  }

  private async loadOrg(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<any>(`/api/bff/organizacion/${this.orgId}`, {
          withCredentials: true,
        }),
      );
      // BFF wraps in ApiResponse — unwrap
      this.org = response?.data ?? response;
    } catch {
      this.generalError = 'No fue posible cargar los datos de la organización.';
    } finally {
      this.loading = false;
    }
  }

  goBack(): void {
    this.router.navigate(['contenedor', 'pages', 'organizaciones', this.orgId]);
  }

  isNavActive(path: string): boolean {
    return this.router.url.includes(`/${path}`);
  }
}
