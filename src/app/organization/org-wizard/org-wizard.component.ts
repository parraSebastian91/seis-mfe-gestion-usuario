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
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
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

type SiiStatus = 'idle' | 'loading' | 'success' | 'warning' | 'error';
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
        if (isRutDvValid(formatted)) {
          if (this.siiStatus !== 'loading') {
            this.lookupSii(formatted);
          }
        } else {
          this.siiStatus = 'idle';
          this.siiMessage = '';
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

  async lookupSii(rut: string): Promise<void> {
    this.siiStatus = 'loading';
    this.siiMessage = '';
    try {
      const res = await firstValueFrom(
        this.http.get<{
          status: 'active' | 'warning' | 'error';
          razonSocial?: string;
          message?: string;
        }>('/api/organizations/sii-lookup', {
          params: { rut },
          withCredentials: true,
        }),
      );
      if (res.status === 'active') {
        this.siiStatus = 'success';
        this.siiMessage = 'Contribuyente activo con Factura Electrónica.';
        if (res.razonSocial && !this.step1.get('razonSocial')!.value) {
          this.step1.get('razonSocial')!.setValue(res.razonSocial);
        }
      } else if (res.status === 'warning') {
        this.siiStatus = 'warning';
        this.siiMessage = res.message ?? 'Advertencia tributaria. Puede continuar con precaución.';
        if (res.razonSocial && !this.step1.get('razonSocial')!.value) {
          this.step1.get('razonSocial')!.setValue(res.razonSocial);
        }
      } else {
        this.siiStatus = 'error';
        this.siiMessage =
          res.message ??
          'RUT no habilitado para Factura Electrónica. No es posible continuar.';
      }
    } catch {
      this.siiStatus = 'idle';
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
      this.siiStatus !== 'error' &&
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
