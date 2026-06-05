import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil, timeout } from 'rxjs/operators';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatStepper } from '@angular/material/stepper';
import { ObjectUploadService, SessionService, UserRole } from 'shared-utils';

// ── Utilities ──────────────────────────────────────────────────────────────────

function formatRutValue(value: string): string {
  const raw = value.replace(/[^0-9kK]/g, '');
  if (raw.length < 2) return raw;
  const dv = raw.slice(-1).toUpperCase();
  const numPart = raw.slice(0, -1);
  const formatted = numPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${dv}`;
}

function isRutDvValid(rut: string): boolean {
  const clean = rut.replace(/[.\- ]/g, '');
  if (clean.length < 2) return false;
  const dv = clean.slice(-1).toUpperCase();
  const num = Number.parseInt(clean.slice(0, -1), 10);
  if (Number.isNaN(num)) return false;
  let sum = 0;
  let mul = 2;
  let tmp = num;
  while (tmp > 0) {
    sum += (tmp % 10) * mul;
    tmp = Math.floor(tmp / 10);
    mul = mul === 7 ? 2 : mul + 1;
  }
  const exp = 11 - (sum % 11);
  let expDv: string;
  if (exp === 11) expDv = '0';
  else if (exp === 10) expDv = 'K';
  else expDv = String(exp);
  return dv === expDv;
}

function getTipoParticipacion(rol: UserRole): 'CEDENTE' | 'FINANCIERA' | 'BROKER' {
  const cedentes: UserRole[] = ['CLIENTE_CEDENTE', 'ADMIN_CEDENTE'];
  const financieras: UserRole[] = ['EJECUTIVO_FINANCIADORA', 'ADMIN_FINANCIADORA'];
  if (cedentes.includes(rol)) return 'CEDENTE';
  if (financieras.includes(rol)) return 'FINANCIERA';
  return 'BROKER';
}

const rutDvValidator: ValidatorFn = (ctrl: AbstractControl): ValidationErrors | null => {
  const v = ctrl.value as string;
  if (!v) return null;
  return isRutDvValid(v) ? null : { invalidRut: true };
};

const ALLOWED_ORG_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ORG_FILE_SIZE = 5 * 1024 * 1024;

// ── Types ──────────────────────────────────────────────────────────────────────

/** Estado visual del campo RUT durante y tras el lookup SII.
 *  - idle      → sin resultado todavía
 *  - loading   → petición en curso (bloquea avance)
 *  - success   → VALIDO          → verde, no bloquea
 *  - warning   → ADVERTENCIA     → amarillo, no bloquea
 *  - blocked   → BLOQUEADO / NO_ENCONTRADO → rojo, bloquea avance
 *  - info      → ERROR_RED       → azul, no bloquea
 */
type SiiStatus = 'idle' | 'loading' | 'success' | 'warning' | 'blocked' | 'info';

/** DTO devuelto por el BFF — el frontend no interpreta la respuesta raw del SII */
interface SiiLookupResult {
  estado: 'VALIDO' | 'ADVERTENCIA' | 'BLOQUEADO' | 'NO_ENCONTRADO' | 'ERROR_RED';
  mensaje: string;
  razonSocial?: string;
  girosNegocio?: string[];
  fechaInicioActividades?: string;
  tieneFacturaElectronica?: boolean;
  tieneObservacionTributaria?: boolean;
}
interface GeoOption { id: string; nombre: string; }
type StepperOrientation = 'horizontal' | 'vertical';

// ── Component ──────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-org-wizard',
  templateUrl: './org-wizard.component.html',
  styleUrls: ['./org-wizard.component.scss'],
  standalone: false,
})
export class OrgWizardComponent implements OnInit, OnDestroy {
  @ViewChild('stepper') stepper!: MatStepper;

  private readonly destroy$ = new Subject<void>();

  // ── Responsive ──────────────────────────────────────────────────────────────
  stepperOrientation: StepperOrientation = 'horizontal';

  // ── Org draft ───────────────────────────────────────────────────────────────
  tipoParticipacion: 'CEDENTE' | 'FINANCIERA' | 'BROKER' = 'CEDENTE';
  orgId: string | null = null;
  saving = false;
  saveError: string | null = null;

  // ── SII Lookup ───────────────────────────────────────────────────────────────
  siiStatus: SiiStatus = 'idle';
  siiMessage = '';
  /** CA-05: razón social que el SII devolvió cuando el usuario ya había escrito una diferente */
  siiRazonSocialHint: string | null = null;
  /** CA-06: caché en memoria por RUT (sin puntos ni guión) */
  private readonly siiCache = new Map<string, SiiLookupResult>();

  // ── Cascading geo ────────────────────────────────────────────────────────────
  regiones: GeoOption[] = [];
  provincias: GeoOption[] = [];
  comunas: GeoOption[] = [];
  loadingRegiones = false;
  loadingProvincias = false;
  loadingComunas = false;

  // ── Bancos ───────────────────────────────────────────────────────────────────
  bancos: { id: string; nombre: string }[] = [];

  // ── Step 4 file uploads ──────────────────────────────────────────────────────
  logoFile: File | null = null;
  bannerFile: File | null = null;
  logoPreview: string | null = null;
  bannerPreview: string | null = null;

  // ── Forms ────────────────────────────────────────────────────────────────────
  step1!: FormGroup;
  step2!: FormGroup;
  step3Cedente!: FormGroup;
  step3Financiera!: FormGroup;
  step4!: FormGroup;

  // ── Constants ─────────────────────────────────────────────────────────────────
  readonly TIPO_DIRECCION_OPTS = [
    'TRIBUTARIA',
    'CASA_MATRIZ',
    'SUCURSAL',
    'BODEGA',
    'ATENCION',
  ];
  readonly TIPO_CUENTA_OPTS = [
    { value: 'CORRIENTE', label: 'Corriente' },
    { value: 'VISTA', label: 'Vista' },
    { value: 'AHORRO', label: 'Ahorro' },
  ];

  constructor(
    private readonly fb: FormBuilder,
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly session: SessionService,
    private readonly uploadService: ObjectUploadService,
    private readonly breakpoints: BreakpointObserver,
  ) {}

  ngOnInit(): void {
    this.buildForms();
    this.subscribeToBreakpoints();
    this.detectTipoParticipacion();
    this.subscribeRutFormatting();
    this.subscribeRutTitularFormatting();
    this.subscribeCascadingGeo();
    this.loadRegiones('CL');
    this.loadBancos();
    this.checkExistingDraft();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Build forms ──────────────────────────────────────────────────────────────

  private buildForms(): void {
    this.step1 = this.fb.group({
      rut: ['', [Validators.required, rutDvValidator]],
      razonSocial: ['', Validators.required],
    });
    this.step2 = this.fb.group({
      calle: ['', Validators.required],
      numero: ['', Validators.required],
      depto: [''],
      pais: ['CL', Validators.required],
      region: ['', Validators.required],
      provincia: ['', Validators.required],
      ciudad: ['', Validators.required],
      comuna: ['', Validators.required],
      codigoPostal: [''],
      referencia: [''],
      tipoDireccion: ['TRIBUTARIA', Validators.required],
    });
    this.step3Cedente = this.fb.group({
      banco: ['', Validators.required],
      tipoCuenta: ['', Validators.required],
      numeroCuenta: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      nombreTitular: ['', Validators.required],
      rutTitular: ['', [Validators.required, rutDvValidator]],
    });
    this.step3Financiera = this.fb.group({
      telefonoOperaciones: ['', Validators.required],
      emailOperaciones: ['', [Validators.required, Validators.email]],
    });
    this.step4 = this.fb.group({
      descripcion: [''],
    });
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────────

  private subscribeToBreakpoints(): void {
    this.breakpoints
      .observe([Breakpoints.Handset, Breakpoints.Tablet])
      .pipe(takeUntil(this.destroy$))
      .subscribe(result => {
        this.stepperOrientation = result.matches ? 'vertical' : 'horizontal';
      });
  }

  private detectTipoParticipacion(): void {
    const rol = this.session.userRole();
    if (rol) {
      this.tipoParticipacion = getTipoParticipacion(rol);
    }
  }

  private subscribeRutFormatting(): void {
    this.step1.get('rut')!.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(300))
      .subscribe((val: string) => {
        if (!val) return;
        const formatted = formatRutValue(val);
        if (formatted !== val) {
          this.step1.get('rut')!.setValue(formatted, { emitEvent: false });
        }
        // Reset SII state when the RUT changes (DV invalid or blank)
        if (!isRutDvValid(formatted)) {
          this.siiStatus = 'idle';
          this.siiMessage = '';
          this.siiRazonSocialHint = null;
        }
      });
  }

  private subscribeRutTitularFormatting(): void {
    this.step3Cedente.get('rutTitular')!.valueChanges
      .pipe(takeUntil(this.destroy$), debounceTime(300))
      .subscribe((val: string) => {
        if (!val) return;
        const formatted = formatRutValue(val);
        if (formatted !== val) {
          this.step3Cedente.get('rutTitular')!.setValue(formatted, { emitEvent: false });
        }
      });
  }

  private subscribeCascadingGeo(): void {
    this.step2.get('pais')!.valueChanges
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe((pais: string) => {
        this.step2.patchValue({ region: '', provincia: '', ciudad: '', comuna: '' });
        this.regiones = [];
        this.provincias = [];
        this.comunas = [];
        if (pais) this.loadRegiones(pais);
      });

    this.step2.get('region')!.valueChanges
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe((region: string) => {
        this.step2.patchValue({ provincia: '', comuna: '' });
        this.provincias = [];
        this.comunas = [];
        if (region) this.loadProvincias(region);
      });

    this.step2.get('provincia')!.valueChanges
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe((provincia: string) => {
        this.step2.patchValue({ comuna: '' });
        this.comunas = [];
        if (provincia) this.loadComunas(provincia);
      });
  }

  // ── SII Lookup ───────────────────────────────────────────────────────────────

  /** CA-01: trigger en blur del campo RUT */
  onRutBlur(): void {
    const val = (this.step1.get('rut')!.value as string) ?? '';
    if (!val || !isRutDvValid(val)) return;
    if (this.siiStatus === 'loading') return;
    this.lookupSii(val);
  }

  async lookupSii(rut: string): Promise<void> {
    // Extraer número y DV para enviar al BFF sin puntos ni guión
    const clean = rut.replace(/[.\- ]/g, '');
    const dv = clean.slice(-1).toUpperCase();
    const rutNum = clean.slice(0, -1);

    // CA-06: usar caché si existe un resultado previo exitoso
    const cached = this.siiCache.get(rutNum);
    if (cached) {
      this.applySiiResult(cached);
      return;
    }

    this.siiStatus = 'loading';
    this.siiMessage = '';
    this.siiRazonSocialHint = null;

    try {
      // CA-02: timeout 10 segundos
      const res = await firstValueFrom(
        this.http
          .get<SiiLookupResult>('/api/bff/organizacion/sii/lookup', {
            params: { rut: rutNum, dv },
            withCredentials: true,
          })
          .pipe(timeout(10_000)),
      );
      // CA-06: solo cachear resultados no-error
      if (res.estado !== 'ERROR_RED') {
        this.siiCache.set(rutNum, res);
      }
      this.applySiiResult(res);
    } catch {
      // Timeout o error de red → CA-02: no bloquear avance
      this.siiStatus = 'info';
      this.siiMessage =
        'No se pudo consultar el SII en este momento. Puedes continuar igualmente.';
    }
  }

  private applySiiResult(res: SiiLookupResult): void {
    const currentRazonSocial = (this.step1.get('razonSocial')!.value as string) ?? '';

    // CA-04: mapear estado a SiiStatus visual
    if (res.estado === 'VALIDO') {
      this.siiStatus = 'success';
    } else if (res.estado === 'ADVERTENCIA') {
      this.siiStatus = 'warning';
    } else if (res.estado === 'ERROR_RED') {
      this.siiStatus = 'info';
    } else {
      this.siiStatus = 'blocked'; // BLOQUEADO | NO_ENCONTRADO
    }
    this.siiMessage = res.mensaje;

    // CA-05: pre-rellenar o mostrar hint
    if (res.razonSocial) {
      if (!currentRazonSocial) {
        this.step1.get('razonSocial')!.setValue(res.razonSocial);
        this.siiRazonSocialHint = null;
      } else if (currentRazonSocial === res.razonSocial) {
        this.siiRazonSocialHint = null;
      } else {
        this.siiRazonSocialHint = res.razonSocial;
      }
    } else {
      this.siiRazonSocialHint = null;
    }
  }

  /** CA-05: el usuario acepta la razón social sugerida por el SII */
  acceptSiiRazonSocial(): void {
    if (this.siiRazonSocialHint) {
      this.step1.get('razonSocial')!.setValue(this.siiRazonSocialHint);
      this.siiRazonSocialHint = null;
    }
  }

  // ── Geo cascading ────────────────────────────────────────────────────────────

  async loadRegiones(pais: string): Promise<void> {
    this.loadingRegiones = true;
    try {
      const res = await firstValueFrom(
        this.http.get<GeoOption[]>('/api/geo/regiones', {
          params: { pais },
          withCredentials: true,
        }),
      );
      this.regiones = res ?? [];
    } catch {
      this.regiones = [];
    } finally {
      this.loadingRegiones = false;
    }
  }

  async loadProvincias(region: string): Promise<void> {
    this.loadingProvincias = true;
    try {
      const res = await firstValueFrom(
        this.http.get<GeoOption[]>('/api/geo/provincias', {
          params: { region },
          withCredentials: true,
        }),
      );
      this.provincias = res ?? [];
    } catch {
      this.provincias = [];
    } finally {
      this.loadingProvincias = false;
    }
  }

  async loadComunas(provincia: string): Promise<void> {
    this.loadingComunas = true;
    try {
      const res = await firstValueFrom(
        this.http.get<GeoOption[]>('/api/geo/comunas', {
          params: { provincia },
          withCredentials: true,
        }),
      );
      this.comunas = res ?? [];
    } catch {
      this.comunas = [];
    } finally {
      this.loadingComunas = false;
    }
  }

  async loadBancos(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ id: string; nombre: string }[]>('/api/bancos', {
          withCredentials: true,
        }),
      );
      this.bancos = res ?? [];
    } catch {
      this.bancos = [];
    }
  }

  // ── Draft recovery ───────────────────────────────────────────────────────────

  async checkExistingDraft(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{
          id: string;
          lastStep: number;
          data: Record<string, unknown>;
        }>('/api/organizations/me/draft', { withCredentials: true }),
      );
      if (res?.id) {
        this.orgId = res.id;
        this.restoreDraftData(res.data, res.lastStep);
      }
    } catch {
      /* no draft in progress — start from step 1 */
    }
  }

  restoreDraftData(data: Record<string, unknown>, lastStep: number): void {
    if (data['step1']) this.step1.patchValue(data['step1']);
    if (data['step2']) this.step2.patchValue(data['step2']);
    if (data['step3Cedente'])
      this.step3Cedente.patchValue(data['step3Cedente']);
    if (data['step3Financiera'])
      this.step3Financiera.patchValue(data['step3Financiera']);
    setTimeout(() => {
      for (let i = 0; i < lastStep; i++) {
        this.stepper?.next();
      }
    }, 150);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  get step3(): FormGroup {
    return this.tipoParticipacion === 'CEDENTE' ? this.step3Cedente : this.step3Financiera;
  }

  get canAdvanceStep1(): boolean {
    return (
      this.step1.valid &&
      this.siiStatus !== 'blocked' &&
      this.siiStatus !== 'loading'
    );
  }

  get canAdvanceStep2(): boolean {
    return this.step2.valid;
  }

  get canAdvanceStep3(): boolean {
    return this.step3.valid;
  }

  // ── Step advancement with incremental save ────────────────────────────────────

  async advanceStep(stepIndex: number): Promise<void> {
    this.saveError = null;
    this.saving = true;
    try {
      if (stepIndex === 0) {
        const body = {
          ...this.step1.value,
          tipoParticipacion: this.tipoParticipacion,
        };
        if (this.orgId) {
          await firstValueFrom(
            this.http.patch(`/api/organizations/${this.orgId}`, body, {
              withCredentials: true,
            }),
          );
        } else {
          const res = await firstValueFrom(
            this.http.post<{ id: string }>('/api/organizations', body, {
              withCredentials: true,
            }),
          );
          this.orgId = res.id;
        }
      } else if (stepIndex === 1) {
        await firstValueFrom(
          this.http.patch(
            `/api/organizations/${this.orgId}`,
            { direccion: this.step2.value },
            { withCredentials: true },
          ),
        );
      } else if (stepIndex === 2) {
        const payload =
          this.tipoParticipacion === 'CEDENTE'
            ? { cuentaBancaria: this.step3Cedente.value }
            : { contactoOperativo: this.step3Financiera.value };
        await firstValueFrom(
          this.http.patch(`/api/organizations/${this.orgId}`, payload, {
            withCredentials: true,
          }),
        );
      }
      this.stepper.next();
    } catch {
      this.saveError = 'No fue posible guardar. Por favor intenta de nuevo.';
    } finally {
      this.saving = false;
    }
  }

  // ── Step 4 file selection ─────────────────────────────────────────────────────

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!ALLOWED_ORG_IMAGE_TYPES.has(file.type)) {
      input.value = '';
      return;
    }
    if (file.size > MAX_ORG_FILE_SIZE) {
      input.value = '';
      return;
    }
    this.logoFile = file;
    const reader = new FileReader();
    reader.onload = e => {
      this.logoPreview = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  onBannerSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!ALLOWED_ORG_IMAGE_TYPES.has(file.type)) {
      input.value = '';
      return;
    }
    if (file.size > MAX_ORG_FILE_SIZE) {
      input.value = '';
      return;
    }
    this.bannerFile = file;
    const reader = new FileReader();
    reader.onload = e => {
      this.bannerPreview = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }

  // ── Finalizar ─────────────────────────────────────────────────────────────────

  async finalize(skip: boolean): Promise<void> {
    this.saving = true;
    this.saveError = null;
    try {
      const user = this.session.user();
      if (user && !skip) {
        if (this.logoFile) {
          const { url } = await this.uploadService.getPresignedPutUrl(
            '',
            'ORG_LOGO',
            'org-logo',
            this.logoFile.type,
            user.id,
            this.orgId ?? undefined,
          );
          await this.uploadService.uploadToPresignedUrl(url, this.logoFile);
        }
        if (this.bannerFile) {
          const { url } = await this.uploadService.getPresignedPutUrl(
            '',
            'ORG_BANNER',
            'org-banner',
            this.bannerFile.type,
            user.id,
            this.orgId ?? undefined,
          );
          await this.uploadService.uploadToPresignedUrl(url, this.bannerFile);
        }
      }
      const body = skip
        ? { estado: 'ONBOARDING_INCOMPLETO' }
        : { ...this.step4.value, estado: 'ACTIVA' };
      await firstValueFrom(
        this.http.patch(`/api/organizations/${this.orgId}/finalize`, body, {
          withCredentials: true,
        }),
      );
      this.router.navigate(['contenedor', 'pages', 'organizaciones', this.orgId]);
    } catch {
      this.saveError = 'Error al finalizar el registro. Por favor intenta de nuevo.';
    } finally {
      this.saving = false;
    }
  }

  // ── EB-01: RUT ya registrado check ────────────────────────────────────────────
  readonly RUT_REGISTRADO_MSG =
    'Ya existe una organización con ese RUT en la plataforma. ' +
    'Si perteneces a ella, solicita unirte desde su perfil.';
}
