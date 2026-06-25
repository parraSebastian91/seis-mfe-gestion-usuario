import { Component, OnInit, effect } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { GrupoTrabajo, OrgMiembro } from '../org-gestor.component';
import { UserStateService } from 'shared-utils';

@Component({
  selector: 'app-admin-grupos',
  templateUrl: './admin-grupos.component.html',
  styleUrls: ['./admin-grupos.component.scss'],
  standalone: false,
})
export class AdminGruposComponent implements OnInit {
  orgId = '';
  grupos: GrupoTrabajo[] = [];
  miembrosOrg: OrgMiembro[] = [];
  loading = true;
  error: string | null = null;

  // ── Create/Edit modal ─────────────────────────────────────────────────────
  showModal = false;
  editingGrupo: GrupoTrabajo | null = null;
  grupoForm: FormGroup;
  saving = false;
  formError: string | null = null;

  // ── Delete confirm ────────────────────────────────────────────────────────
  deletingGrupo: GrupoTrabajo | null = null;
  deleting = false;
  deleteError: string | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly fb: FormBuilder,
    private readonly userState: UserStateService,
  ) {
    this.grupoForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.maxLength(100)]],
      descripcion: [''],
      liderUuid: ['', Validators.required],
    });
    effect(async () => {
      const selectedOrgId = this.userState.orgSelected();
      if (!selectedOrgId || selectedOrgId === this.orgId) return;
      this.orgId = selectedOrgId;
      await Promise.all([this.load(), this.loadMiembros()]);
    });
  }

  async ngOnInit(): Promise<void> {
    this.orgId =
      (this.route.parent?.snapshot.params['id'] as string) ||
      this.userState.orgSelected() ||
      '';
    await Promise.all([this.load(), this.loadMiembros()]);
  }

  async load(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: GrupoTrabajo[] }>(
          `/api/bff/organizacion/${this.orgId}/grupos`,
          { withCredentials: true },
        ),
      );
      this.grupos = res.data ?? [];
    } catch {
      this.error = 'No se pudieron cargar los grupos.';
    } finally {
      this.loading = false;
    }
  }

  private async loadMiembros(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: OrgMiembro[] }>(
          `/api/bff/organizacion/${this.orgId}/miembros`,
          { withCredentials: true },
        ),
      );
      this.miembrosOrg = res.data ?? [];
    } catch {
      /* silent */
    }
  }

  // ── Create / Edit ─────────────────────────────────────────────────────────

  openCreate(): void {
    this.editingGrupo = null;
    this.grupoForm.reset({ nombre: '', descripcion: '', liderUuid: '' });
    this.formError = null;
    this.showModal = true;
  }

  openEdit(g: GrupoTrabajo): void {
    this.editingGrupo = g;
    this.grupoForm.patchValue({
      nombre: g.nombre,
      descripcion: g.descripcion ?? '',
      liderUuid: g.liderUuid,
    });
    this.formError = null;
    this.showModal = true;
  }

  async saveGrupo(): Promise<void> {
    if (this.grupoForm.invalid) return;
    this.saving = true;
    this.formError = null;
    const val = this.grupoForm.value;
    try {
      if (this.editingGrupo) {
        await firstValueFrom(
          this.http.patch(
            `/api/bff/organizacion/grupos/${this.editingGrupo.grupoId}`,
            { nombre: val.nombre, descripcion: val.descripcion },
            { withCredentials: true },
          ),
        );
        const g = this.grupos.find(
          (x) => x.grupoId === this.editingGrupo!.grupoId,
        );
        if (g) {
          g.nombre = val.nombre;
          g.descripcion = val.descripcion;
        }
      } else {
        const res = await firstValueFrom(
          this.http.post<{ data: GrupoTrabajo }>(
            `/api/bff/organizacion/${this.orgId}/grupos`,
            {
              nombre: val.nombre,
              descripcion: val.descripcion,
              liderUuid: val.liderUuid,
            },
            { withCredentials: true },
          ),
        );
        this.grupos.push(res.data);
      }
      this.showModal = false;
    } catch (err: any) {
      this.formError = err?.error?.message ?? 'No se pudo guardar el grupo.';
    } finally {
      this.saving = false;
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  openDelete(g: GrupoTrabajo): void {
    this.deletingGrupo = g;
    this.deleteError = null;
  }

  async confirmDelete(): Promise<void> {
    if (!this.deletingGrupo) return;
    this.deleting = true;
    this.deleteError = null;
    try {
      await firstValueFrom(
        this.http.delete(
          `/api/bff/organizacion/grupos/${this.deletingGrupo.grupoId}`,
          { withCredentials: true },
        ),
      );
      this.grupos = this.grupos.filter(
        (g) => g.grupoId !== this.deletingGrupo!.grupoId,
      );
      this.deletingGrupo = null;
    } catch {
      this.deleteError = 'No se pudo eliminar el grupo.';
    } finally {
      this.deleting = false;
    }
  }

  // ── Navigate to detail ────────────────────────────────────────────────────

  goToDetalle(g: GrupoTrabajo): void {
    this.router.navigate([g.grupoId], { relativeTo: this.route });
  }

  miembroLabel(uuid: string): string {
    const m = this.miembrosOrg.find((x) => x.usuarioUuid === uuid);
    return m ? `${m.nombre} ${m.apellido}` : uuid;
  }
}
