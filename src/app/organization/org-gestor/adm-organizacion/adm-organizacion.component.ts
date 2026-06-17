import {
  Component,
  OnInit,
  OnDestroy,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import { SessionService } from 'shared-utils';

// ── Validador RUT chileno (reutilizado del org-wizard) ─────────────────────────
function isRutDvValid(rut: string): boolean {
  const clean = rut.replace(/[.\- ]/g, '');
  if (clean.length < 2) return false;
  const dv  = clean.slice(-1).toUpperCase();
  const num = Number.parseInt(clean.slice(0, -1), 10);
  if (Number.isNaN(num)) return false;
  let sum = 0, mul = 2, tmp = num;
  while (tmp > 0) {
    sum += (tmp % 10) * mul;
    tmp  = Math.floor(tmp / 10);
    mul  = mul === 7 ? 2 : mul + 1;
  }
  const exp = 11 - (sum % 11);
  const expDv = exp === 11 ? '0' : exp === 10 ? 'K' : String(exp);
  return dv === expDv;
}

function formatRutValue(value: string): string {
  const raw = value.replace(/[^0-9kK]/g, '');
  if (raw.length < 2) return raw;
  const dv      = raw.slice(-1).toUpperCase();
  const numPart = raw.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${numPart}-${dv}`;
}

const rutDvValidator: ValidatorFn = (ctrl: AbstractControl): ValidationErrors | null =>
  isRutDvValid(ctrl.value ?? '') ? null : { invalidRut: true };

// ── Tabs ───────────────────────────────────────────────────────────────────────
export type AdmOrgTab = 0 | 1 | 2 | 3;

// ── Pestaña 4 — Danger Zone ────────────────────────────────────────────────────
type BajaStep = 'idle' | 'confirm-word' | 'submitting' | 'done' | 'error';

// ── Datos de la organización (para pre-poblar formularios) ────────────────────
interface OrgAdmData {
  id: string;
  razonSocial: string;
  rut?: string;
  descripcion?: string;
  vision?: string;
  objetivos?: string;
  logoUrl?: string;
  bannerUrl?: string;
  videoUrl?: string;
  // Operativa
  calle?: string;
  numero?: string;
  comuna?: string;
  region?: string;
  banco?: string;
  tipoCuenta?: string;
  numeroCuenta?: string;
  rutEmpresa?: string;
  // Notificaciones (Ley de Datos)
  notifEmail?: boolean;
  notifSms?: boolean;
  notifPush?: boolean;
  consentimientoDatos?: boolean;
  consentimientoFacturacion?: boolean;
}

const BANCOS_CL = [
  'Banco de Chile',
  'Banco Estado',
  'Scotiabank Chile',
  'BCI',
  'Santander Chile',
  'Itaú Chile',
  'Security',
  'Falabella',
  'Ripley',
  'Consorcio',
  'BICE',
  'Banco Internacional',
  'Coopeuch',
] as const;

const REGIONES_CL = [
  'Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo',
  'Valparaíso', 'Metropolitana de Santiago', "O'Higgins", 'Maule', 'Ñuble',
  'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes',
] as const;

const ALLOWED_IMG_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm', 'video/ogg']);
const MAX_IMG_SIZE  = 5  * 1024 * 1024;  // 5 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 MB

@Component({
  selector: 'app-adm-organizacion',
  templateUrl: './adm-organizacion.component.html',
  styleUrls: ['./adm-organizacion.component.scss'],
  standalone: false,
})
export class AdmOrganizacionComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  orgId = '';
  loading = true;
  error: string | null = null;
  org: OrgAdmData | null = null;

  activeTab: AdmOrgTab = 0;

  readonly tabDefs = [
    { label: 'Identidad y Presentación',         icon: 'badge'    },
    { label: 'Operativa y Financiera',            icon: 'business' },
    { label: 'Privacidad y Cumplimiento',         icon: 'shield'   },
    { label: 'Configuración de Cuenta',           icon: 'settings' },
  ] as const;

  readonly bancos    = BANCOS_CL;
  readonly regiones  = REGIONES_CL;

  // ── Formularios ───────────────────────────────────────────────────────────────

  /** Tab 0 — Identidad y Presentación */
  identidadForm!: FormGroup;

  /** Tab 1 — Información Operativa y Financiera */
  operativaForm!: FormGroup;

  /** Tab 2 — Privacidad y Cumplimiento */
  privacidadForm!: FormGroup;

  // ── Estado de guardado ────────────────────────────────────────────────────────
  savingIdentidad  = false;
  savingOperativa  = false;
  savingPrivacidad = false;
  saveError: string | null = null;
  saveSuccess: string | null = null;

  // ── Uploaders — Tab 0 ─────────────────────────────────────────────────────────
  uploadingLogo   = false;
  uploadingBanner = false;
  uploadingVideo  = false;
  uploadError: string | null = null;
  logoPreview:   string | null = null;
  bannerPreview: string | null = null;
  videoFile: File | null = null;
  videoObjectUrl: string | null = null;

  // ── Danger Zone — Tab 3 ───────────────────────────────────────────────────────
  bajaStep: BajaStep = 'idle';
  bajaWord = '';
  bajaError: string | null = null;
  readonly BAJA_CONFIRMATION_WORD = 'ELIMINAR';

  constructor(
    private readonly route: ActivatedRoute,
    private readonly http: HttpClient,
    private readonly fb: FormBuilder,
    private readonly session: SessionService,
  ) {}

  ngOnInit(): void {
    this.orgId = this.route.parent?.snapshot.params['id'] as string ?? '';
    this.buildForms();
    this.loadOrg();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
  }

  // ── Construcción de formularios ───────────────────────────────────────────────

  private buildForms(): void {
    this.identidadForm = this.fb.group({
      descripcion: ['', Validators.maxLength(1500)],
      vision:      ['', Validators.maxLength(1000)],
      objetivos:   ['', Validators.maxLength(1000)],
    });

    this.operativaForm = this.fb.group({
      calle:        ['', Validators.required],
      numero:       [''],
      comuna:       ['', Validators.required],
      region:       ['', Validators.required],
      banco:        [''],
      tipoCuenta:   ['CORRIENTE'],
      numeroCuenta: ['', [Validators.pattern(/^\d{6,20}$/)]],
      rutEmpresa:   ['', [rutDvValidator]],
    });

    this.privacidadForm = this.fb.group({
      notifEmail:               [true],
      notifSms:                 [false],
      notifPush:                [false],
      consentimientoDatos:      [false, Validators.requiredTrue],
      consentimientoFacturacion:[false, Validators.requiredTrue],
    });
  }

  // ── Carga de datos ────────────────────────────────────────────────────────────

  async loadOrg(): Promise<void> {
    this.loading = true;
    this.error   = null;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: OrgAdmData }>(
          `/api/bff/organizacion/${this.orgId}/admin/config`,
          { withCredentials: true },
        ),
      );
      this.org = res?.data ?? res as unknown as OrgAdmData;
      this.patchForms(this.org);
    } catch {
      // Endpoint aún no existe en el backend — pre-popular con vacíos
      this.org = { id: this.orgId, razonSocial: '' };
    } finally {
      this.loading = false;
    }
  }

  private patchForms(org: OrgAdmData): void {
    this.identidadForm.patchValue({
      descripcion: org.descripcion ?? '',
      vision:      org.vision      ?? '',
      objetivos:   org.objetivos   ?? '',
    });

    this.operativaForm.patchValue({
      calle:        org.calle        ?? '',
      numero:       org.numero       ?? '',
      comuna:       org.comuna       ?? '',
      region:       org.region       ?? '',
      banco:        org.banco        ?? '',
      tipoCuenta:   org.tipoCuenta   ?? 'CORRIENTE',
      numeroCuenta: org.numeroCuenta ?? '',
      rutEmpresa:   org.rutEmpresa   ?? '',
    });

    this.privacidadForm.patchValue({
      notifEmail:                org.notifEmail               ?? true,
      notifSms:                  org.notifSms                 ?? false,
      notifPush:                 org.notifPush                ?? false,
      consentimientoDatos:       org.consentimientoDatos      ?? false,
      consentimientoFacturacion: org.consentimientoFacturacion ?? false,
    });

    this.logoPreview   = org.logoUrl   ?? null;
    this.bannerPreview = org.bannerUrl ?? null;
  }

  // ── Tab helpers ───────────────────────────────────────────────────────────────

  setTab(tab: AdmOrgTab): void {
    this.activeTab  = tab;
    this.saveError  = null;
    this.saveSuccess = null;
  }

  private clearStatus(): void {
    this.saveError   = null;
    this.saveSuccess = null;
  }

  // ── Tab 0: Identidad — Guardar ────────────────────────────────────────────────

  async saveIdentidad(): Promise<void> {
    if (this.identidadForm.invalid) return;
    this.clearStatus();
    this.savingIdentidad = true;
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/bff/organizacion/${this.orgId}/admin/presentacion`,
          this.identidadForm.value,
          { withCredentials: true },
        ),
      );
      this.saveSuccess = 'Identidad actualizada correctamente.';
    } catch (err: any) {
      this.saveError = err?.error?.message ?? 'No se pudo guardar. Intenta nuevamente.';
    } finally {
      this.savingIdentidad = false;
    }
  }

  // ── Tab 0: Uploaders ──────────────────────────────────────────────────────────

  async onLogoSelected(event: Event): Promise<void> {
    const file = this.extractFile(event, ALLOWED_IMG_TYPES, MAX_IMG_SIZE);
    if (!file) return;
    this.uploadingLogo = true;
    this.uploadError   = null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', 'logo');
      const res = await firstValueFrom(
        this.http.post<{ data: { url: string } }>(
          `/api/bff/organizacion/${this.orgId}/imagen`,
          formData,
          { withCredentials: true },
        ),
      );
      this.logoPreview = res?.data?.url ?? URL.createObjectURL(file);
    } catch {
      this.uploadError = 'No se pudo subir el logo.';
    } finally {
      this.uploadingLogo = false;
    }
  }

  async onBannerSelected(event: Event): Promise<void> {
    const file = this.extractFile(event, ALLOWED_IMG_TYPES, MAX_IMG_SIZE);
    if (!file) return;
    this.uploadingBanner = true;
    this.uploadError     = null;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('tipo', 'banner');
      const res = await firstValueFrom(
        this.http.post<{ data: { url: string } }>(
          `/api/bff/organizacion/${this.orgId}/imagen`,
          formData,
          { withCredentials: true },
        ),
      );
      this.bannerPreview = res?.data?.url ?? URL.createObjectURL(file);
    } catch {
      this.uploadError = 'No se pudo subir el banner.';
    } finally {
      this.uploadingBanner = false;
    }
  }

  onVideoSelected(event: Event): void {
    const file = this.extractFile(event, ALLOWED_VIDEO_TYPES, MAX_VIDEO_SIZE);
    if (!file) return;
    if (this.videoObjectUrl) URL.revokeObjectURL(this.videoObjectUrl);
    this.videoFile      = file;
    this.videoObjectUrl = URL.createObjectURL(file);
  }

  private extractFile(event: Event, allowed: Set<string>, maxSize: number): File | null {
    const input = event.target as HTMLInputElement;
    const file  = input?.files?.[0] ?? null;
    if (input) input.value = '';
    if (!file) return null;
    if (!allowed.has(file.type)) {
      this.uploadError = `Tipo de archivo no permitido: ${file.type}`;
      return null;
    }
    if (file.size > maxSize) {
      this.uploadError = `El archivo supera el límite de ${Math.round(maxSize / 1024 / 1024)} MB.`;
      return null;
    }
    return file;
  }

  // ── Tab 1: Operativa — Guardar ────────────────────────────────────────────────

  onRutInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const formatted = formatRutValue(input.value);
    this.operativaForm.patchValue({ rutEmpresa: formatted }, { emitEvent: false });
    input.value = formatted;
  }

  async saveOperativa(): Promise<void> {
    if (this.operativaForm.invalid) return;
    this.clearStatus();
    this.savingOperativa = true;
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/bff/organizacion/${this.orgId}/admin/operativa`,
          this.operativaForm.value,
          { withCredentials: true },
        ),
      );
      this.saveSuccess = 'Datos operativos actualizados.';
    } catch (err: any) {
      this.saveError = err?.error?.message ?? 'No se pudo guardar.';
    } finally {
      this.savingOperativa = false;
    }
  }

  // ── Tab 2: Privacidad — Guardar ───────────────────────────────────────────────

  async savePrivacidad(): Promise<void> {
    this.clearStatus();
    this.savingPrivacidad = true;
    try {
      await firstValueFrom(
        this.http.patch(
          `/api/bff/organizacion/${this.orgId}/admin/privacidad`,
          this.privacidadForm.value,
          { withCredentials: true },
        ),
      );
      this.saveSuccess = 'Preferencias de privacidad guardadas.';
    } catch (err: any) {
      this.saveError = err?.error?.message ?? 'No se pudo guardar.';
    } finally {
      this.savingPrivacidad = false;
    }
  }

  // ── Tab 2: Derecho ARCO — solicitar exportación ───────────────────────────────

  async solicitarExportacion(): Promise<void> {
    this.clearStatus();
    try {
      await firstValueFrom(
        this.http.post(
          `/api/bff/organizacion/${this.orgId}/admin/exportar-datos`,
          {},
          { withCredentials: true },
        ),
      );
      this.saveSuccess = 'Solicitud de exportación enviada. Recibirás un correo en las próximas 72 horas (Ley N° 19.628).';
    } catch {
      this.saveError = 'No se pudo enviar la solicitud. Intenta más tarde.';
    }
  }

  // ── Tab 3: Danger Zone ────────────────────────────────────────────────────────

  openBajaFlow(): void {
    this.bajaStep  = 'confirm-word';
    this.bajaWord  = '';
    this.bajaError = null;
  }

  cancelBaja(): void {
    this.bajaStep  = 'idle';
    this.bajaWord  = '';
    this.bajaError = null;
  }

  get bajaWordMatch(): boolean {
    return this.bajaWord.trim().toUpperCase() === this.BAJA_CONFIRMATION_WORD;
  }

  async confirmarBaja(): Promise<void> {
    if (!this.bajaWordMatch) {
      this.bajaError = `Debes escribir exactamente "${this.BAJA_CONFIRMATION_WORD}" para continuar.`;
      return;
    }
    this.bajaStep  = 'submitting';
    this.bajaError = null;
    try {
      await firstValueFrom(
        this.http.delete(
          `/api/bff/organizacion/${this.orgId}`,
          { withCredentials: true },
        ),
      );
      this.bajaStep = 'done';
    } catch (err: any) {
      this.bajaStep  = 'error';
      this.bajaError = err?.error?.message ?? 'No se pudo procesar la solicitud de baja.';
    }
  }

  // ── Helpers de UI ─────────────────────────────────────────────────────────────

  get identidadDescLen(): number {
    return (this.identidadForm.get('descripcion')?.value as string ?? '').length;
  }

  fieldError(form: FormGroup, field: string): string | null {
    const ctrl = form.get(field);
    if (!ctrl || !ctrl.touched || ctrl.valid) return null;
    if (ctrl.hasError('required'))    return 'Este campo es requerido.';
    if (ctrl.hasError('maxlength'))   return `Máximo ${ctrl.errors?.['maxlength']?.requiredLength} caracteres.`;
    if (ctrl.hasError('pattern'))     return 'Formato inválido.';
    if (ctrl.hasError('invalidRut'))  return 'El RUT ingresado no es válido.';
    if (ctrl.hasError('requiredTrue'))return 'Debes aceptar este consentimiento para continuar.';
    return null;
  }
}
