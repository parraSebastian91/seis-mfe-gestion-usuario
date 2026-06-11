import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

interface OrgSummary {
  id: string;
  nombre: string;
  rut: string;
  tipo?: 'CEDENTE' | 'FINANCIERA' | 'BROKER';
  logoUrl?: string;
  estado?: 'ACTIVA' | 'ONBOARDING_INCOMPLETO';
}

@Component({
  selector: 'app-org-list',
  templateUrl: './org-list.component.html',
  styleUrls: ['./org-list.component.scss'],
  standalone: false,
})
export class OrgListComponent implements OnInit {
  organizations: OrgSummary[] = [];
  loading = true;
  error: string | null = null;

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  ngOnInit(): void {
    this.loadOrganizations();
  }

  async loadOrganizations(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const res = await firstValueFrom(
        this.http.get<any[]>('/api/bff/organizations/me', {
          withCredentials: true,
        }),
      );
      this.organizations = (res ?? []).map(o => ({
        id:      o.organizacionUUID ?? o.id,
        nombre:  o.razonSocial ?? o.razon_social ?? o.nombre ?? '',
        rut:     o.dv ? `${o.rut}-${o.dv}` : o.rut,
        tipo:    o.tipo ?? o.tipo_participante ?? o.tipoParticipante ?? o.tipoParticipacion,
        logoUrl: o.logoUrl ?? o.logo_url ?? undefined,
        estado:  o.estado,
      } as OrgSummary));
    } catch {
      this.error = 'No fue posible cargar tus organizaciones. Intenta de nuevo.';
    } finally {
      this.loading = false;
    }
  }

  goToWizard(): void {
    this.router.navigate(['contenedor', 'pages', 'organizaciones', 'nueva']);
  }

  goToOrg(id: string): void {
    this.router.navigate(['contenedor', 'pages', 'organizaciones', id]);
  }

  resumeWizard(): void {
    this.router.navigate(['contenedor', 'pages', 'organizaciones', 'nueva']);
  }
}
