import { Component, OnInit, OnDestroy } from '@angular/core';
import {
  AbstractControl,
  FormArray,
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

/** Estructura raw que devuelve el SII a través del BFF */
interface GiroSiiRaw {
  codigo: string;
  descripcion: string;
  categoriaTributaria?: string;
  fechaInicio?: string;
  indicadorAfectoIva?: string;
}

/** DTO interno y de envío al backend para crear/editar organización */
interface GiroComercial {
  codigo: string;
  fuente: string;             // 'SII' | 'BD' | 'MANUAL'
  descripcion: string;
  categoriaTributaria?: string;
  afectoIva?: boolean;
  fechaInicio?: string;
  esPrincipal?: boolean;
}

interface OrganizacionBodyDTO {
  tipoPersona: TipoPersona,
  tipoParticipacion: TipoParticipante,
  rut: string,
  razonSocial: string,
  giros: GiroComercial[],
  rawSii?: any,  
}

interface SiiLookupResult {
  estado: 'VALIDO' | 'ADVERTENCIA' | 'BLOQUEADO' | 'NO_ENCONTRADO' | 'ERROR_RED';
  mensaje: string;
  razonSocial?: string;
  girosNegocio?: GiroSiiRaw[];
  fechaInicioActividades?: string;
  tieneFacturaElectronica?: boolean;
  tieneObservacionTributaria?: boolean;
  raw: any;
}
interface ApiResp<T> { data: T; }
interface GeoOption { id: string; nombre: string; }
interface ProductoFinanciero { id: string; nombre: string; }
type TipoPersona = 'JURIDICA' | 'PERSONA_NATURAL';
type TipoParticipante = 'CEDENTE' | 'FINANCIERA' | 'BROKER';

// ── Component ──────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-org-wizard',
  templateUrl: './org-wizard.component.html',
  styleUrls: ['./org-wizard.component.scss'],
  standalone: false,
})
export class OrgWizardComponent implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  // ── Custom stepper ───────────────────────────────────────────────────────────
  currentStep = 0;

  get stepLabels(): string[] {
    const base = ['Identidad legal', 'Direcci\u00f3n', this.esCedente ? 'Cuenta bancaria' : 'Cobertura'];
    if (this.esFinancieraBroker) base.push('Perfil operativo');
    base.push('Presentaci\u00f3n', 'Notificaciones');
    return base;
  }

  get presentacionStep(): number {
    return this.esFinancieraBroker ? 4 : 3;
  }

  get notifStep(): number {
    return this.esFinancieraBroker ? 5 : 4;
  }

  goBack(): void {
    if (this.currentStep > 0) this.currentStep--;
  }

  goNext(): void {
    this.currentStep++;
  }

  // ── Org draft ───────────────────────────────────────────────────────────────
  tipoParticipacion: TipoParticipante = 'CEDENTE';
  orgId: string | null = null;
  saving = false;
  saveError: string | null = null;
  /** true cuando tipoPersona/tipoParticipante fueron bloqueados por el perfil de org existente */
  perfilOrgLocked = false;

  // ── SII Lookup ───────────────────────────────────────────────────────────────
  siiStatus: SiiStatus = 'idle';
  siiMessage = '';
  siiRawResult: any | null = null;
  /** CA-05: razón social que el SII devolvió cuando el usuario ya había escrito una diferente */
  siiRazonSocialHint: string | null = null;
  /** CA-06: caché en memoria por RUT (sin puntos ni guión) */
  private readonly siiCache = new Map<string, SiiLookupResult>();
  

  // ── Add giro (paso 1) ────────────────────────────────────────────────────────
  showAddGiro = false;
  newGiroCodigo = '';
  newGiroDesc = '';
  /** Indica el origen de los giros actualmente cargados en el formulario */
  girosOrigen: 'sii' | 'bd' | 'manual' | null = null;

  // ── RUT ya registrado (EB-01) ────────────────────────────────────────────────
  rutYaRegistrado: { id: string; razonSocial: string; giros: GiroComercial[] } | null = null;
  /** RUT limpio (sin puntos/guión) del check en curso — evita que el debounce lo resetee */
  private _pendingCheckClean = '';
  showJoinModal = false;
  joinSending = false;
  joinError: string | null = null;
  joinSuccess = false;

  // ── Cascading geo (paso 2) ────────────────────────────────────────────────────
  regiones: GeoOption[] = [];
  provincias: GeoOption[] = [];
  comunas: GeoOption[] = [];
  loadingRegiones = false;
  loadingProvincias = false;
  loadingComunas = false;

  // ── Cascading geo (paso 3b — cobertura) ──────────────────────────────────────
  regionesCobertura: GeoOption[] = [];
  loadingRegionesCobertura = false;

  // ── Bancos ───────────────────────────────────────────────────────────────────
  bancos: { id: string; nombre: string }[] = [];

  // ── Productos financieros (paso 4 FINANCIERA/BROKER) ─────────────────────────
  productosFinancieros: ProductoFinanciero[] = [];
  loadingProductos = false;

  // ── Plataformas de firma ──────────────────────────────────────────────────────
  readonly PLATAFORMAS_FIRMA = ['DocuSign', 'Mifiel', 'FirmaVirtual', 'Otra'];

  // ── Paso 5 file uploads ──────────────────────────────────────────────────────
  logoFile: File | null = null;
  bannerFile: File | null = null;
  logoPreview: string | null = null;
  bannerPreview: string | null = null;

  // ── Forms ────────────────────────────────────────────────────────────────────
  step1!: FormGroup;
  step2!: FormGroup;
  step3Cedente!: FormGroup;
  step3Cobertura!: FormGroup;
  step4Perfil!: FormGroup;
  step5!: FormGroup;
  step6!: FormGroup;

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
  readonly TIPO_PARTICIPANTE_OPTS: { value: TipoParticipante; label: string }[] = [
    { value: 'CEDENTE', label: 'Cedente' },
    { value: 'FINANCIERA', label: 'Financiadora' },
    { value: 'BROKER', label: 'Broker' },
  ];

  constructor(
    private readonly fb: FormBuilder,
    private readonly http: HttpClient,
    private readonly router: Router,
    private readonly session: SessionService,
    private readonly uploadService: ObjectUploadService,
  ) { }

  ngOnInit(): void {
    this.buildForms();
    this.detectTipoParticipacion();
    this.loadPerfilOrganizacion();
    this.subscribeRutFormatting();
    this.subscribeRutTitularFormatting();
    this.subscribeCascadingGeo();
    this.subscribeTipoPersona();
    this.subscribeFirmaDigital();
    this.subscribeCoberturaGeo();
    this.loadRegiones('CL');
    this.loadBancos();
    this.loadProductosFinancieros();
    this.checkExistingDraft();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Build forms ──────────────────────────────────────────────────────────────

  private buildForms(): void {
    // ── Paso 1: Identidad legal ─────────────────────────────────────────────
    this.step1 = this.fb.group({
      tipoPersona: ['JURIDICA', Validators.required],
      tipoParticipante: ['CEDENTE', Validators.required],
      rut: ['', [Validators.required, rutDvValidator]],
      razonSocial: ['', Validators.required],
      giros: this.fb.array([]),
    });

    // ── Paso 2: Dirección principal ─────────────────────────────────────────
    this.step2 = this.fb.group({
      calle: ['', Validators.required],
      numero: ['', Validators.required],
      depto: [''],
      pais: ['CL', Validators.required],
      region: ['', Validators.required],
      provincia: [{ value: '', disabled: true }, Validators.required],
      ciudad: ['', Validators.required],
      comuna: [{ value: '', disabled: true }, Validators.required],
      codigoPostal: [''],
      referencia: [''],
      tipoDireccion: ['TRIBUTARIA', Validators.required],
      esPrincipal: [true],
    });

    // ── Paso 3 CEDENTE: Cuenta bancaria ─────────────────────────────────────
    this.step3Cedente = this.fb.group({
      banco: ['', Validators.required],
      tipoCuenta: ['', Validators.required],
      numeroCuenta: ['', [Validators.required, Validators.pattern(/^\d+$/)]],
      nombreTitular: ['', Validators.required],
      rutTitular: ['', [Validators.required, rutDvValidator]],
    });

    // ── Paso 3 FINANCIERA/BROKER: Cobertura geográfica ──────────────────────
    this.step3Cobertura = this.fb.group({
      operaOtrasRegiones: [false],
      zonas: this.fb.array([]),
    });

    // ── Paso 4 FINANCIERA/BROKER: Perfil operativo ──────────────────────────
    this.step4Perfil = this.fb.group({
      montoMinimo: [null, [Validators.required, Validators.min(0)]],
      montoMaximo: [null, [Validators.required, Validators.min(0)]],
      plazoTipicoPago: [null, [Validators.required, Validators.min(1)]],
      firmaDigital: [false],
      plataformaFirma: [''],
      emailOperaciones: ['', [Validators.required, Validators.email]],
      telefonoOperaciones: ['', Validators.required],
      productosIds: [[] as string[]],
    });

    // ── Paso 5: Presentación (logo, banner, descripción) ────────────────────
    this.step5 = this.fb.group({
      descripcion: [''],
    });

    // ── Paso 6: Notificaciones ───────────────────────────────────────────────
    this.step6 = this.fb.group({
      notifEmail: [true],
      notifWhatsapp: [false],
      notifNuevasOfertas: [true],
      notifEstadoFacturas: [true],
      notifLiquidacion: [true],
      notifVencimientos: [true],
      notifInApp: [true],
    });
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────────

  private detectTipoParticipacion(): void {
    const rol = this.session.userRole();
    if (rol) {
      this.tipoParticipacion = getTipoParticipacion(rol);
      this.step1.get('tipoParticipante')!.setValue(this.tipoParticipacion, { emitEvent: false });
    }
  }

  private async loadPerfilOrganizacion(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http
          .get<{ data: { organizaciones: { tipo_participante: string; tipo_organizacion: string }[] } }>(
            '/api/bff/usuario/profile/organizacion',
            { withCredentials: true },
          )
          .pipe(timeout(8_000)),
      );
      const org = res?.data?.organizaciones?.[0];
      if (!org) return;

      if (org.tipo_organizacion) {
        this.step1.get('tipoPersona')!.setValue(org.tipo_organizacion, { emitEvent: false });
        this.step1.get('tipoPersona')!.disable();
        this.perfilOrgLocked = true;
      }

      if (org.tipo_participante) {
        const participante = org.tipo_participante as TipoParticipante;
        this.tipoParticipacion = participante;
        this.step1.get('tipoParticipante')!.setValue(participante, { emitEvent: false });
        this.step1.get('tipoParticipante')!.disable();
        this.perfilOrgLocked = true;
      }
    } catch {
      // No bloquear el wizard si el perfil no está disponible
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
        const cleanNew = formatted.replace(/[.\- ]/g, '');
        // Si el debounce dispara para el mismo RUT que onRutBlur está verificando
        // (race condition debounce vs HTTP), no resetear el estado ya establecido
        if (cleanNew === this._pendingCheckClean) return;
        this._pendingCheckClean = '';

        // Reset SII state and RUT-registrado state when the RUT changes
        if (!isRutDvValid(formatted)) {
          this.siiStatus = 'idle';
          this.siiMessage = '';
          this.siiRazonSocialHint = null;
        }
        this.rutYaRegistrado = null;
        this.joinSuccess = false;
        this.girosOrigen = null;
        this.step1.get('razonSocial')!.enable();
        this.step1.get('giros')!.enable();
        // Re-habilitar solo si fueron bloqueados por check-rut (no por loadPerfilOrganizacion)
        if (!this.perfilOrgLocked) {
          this.step1.get('tipoPersona')!.enable();
          this.step1.get('tipoParticipante')!.enable();
        }
      });
  }

  private subscribeTipoPersona(): void {
    this.step1.get('tipoPersona')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((tipo: TipoPersona) => {
        const rutCtrl = this.step1.get('rut')!;
        if (tipo === 'PERSONA_NATURAL') {
          rutCtrl.clearValidators();
          rutCtrl.setValidators([rutDvValidator]);
        } else {
          rutCtrl.setValidators([Validators.required, rutDvValidator]);
        }
        rutCtrl.updateValueAndValidity();
      });

    this.step1.get('tipoParticipante')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((val: TipoParticipante) => {
        this.tipoParticipacion = val;
      });
  }

  private subscribeFirmaDigital(): void {
    this.step4Perfil.get('firmaDigital')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((activa: boolean) => {
        const plataformaCtrl = this.step4Perfil.get('plataformaFirma')!;
        if (activa) {
          plataformaCtrl.setValidators(Validators.required);
        } else {
          plataformaCtrl.clearValidators();
          plataformaCtrl.setValue('');
        }
        plataformaCtrl.updateValueAndValidity();
      });
  }

  private subscribeCoberturaGeo(): void {
    this.step3Cobertura.get('operaOtrasRegiones')!.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((activo: boolean) => {
        if (!activo) {
          this.zonasCobertura.clear();
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
        this.step2.get('provincia')!.disable();
        this.step2.get('comuna')!.disable();
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
        this.step2.get('comuna')!.disable();
        if (region) {
          this.step2.get('provincia')!.enable();
          this.loadProvincias(region);
        } else {
          this.step2.get('provincia')!.disable();
        }
      });

    this.step2.get('provincia')!.valueChanges
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe((provincia: string) => {
        this.step2.patchValue({ comuna: '' });
        this.comunas = [];
        if (provincia) {
          this.step2.get('comuna')!.enable();
          this.loadComunas(provincia);
        } else {
          this.step2.get('comuna')!.disable();
        }
      });
  }

  // ── SII Lookup ───────────────────────────────────────────────────────────────

  /** CA-01: trigger en blur del campo RUT */
  async onRutBlur(): Promise<void> {
    const val = (this.step1.get('rut')!.value as string) ?? '';
    if (!val || !isRutDvValid(val)) return;
    if (this.siiStatus === 'loading') return;

    // Fijar RUT antes del await para que el debounce del formateador no resetee
    // el resultado si dispara mientras el HTTP está en vuelo
    this._pendingCheckClean = val.replace(/[.\- ]/g, '');

    // EB-01: si el RUT ya está en la plataforma, pre-llenamos desde nuestra BD
    // y NO consultamos el SII (los datos ya existen)
    await this.checkRutRegistrado(val);
    if (this.rutYaRegistrado) return;

    // RUT nuevo → consultar SII
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
    this.siiRawResult = res.raw;
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

    // Poblar giros desde SII — mapear raw SII → GiroComercial
    if (res.girosNegocio?.length) {
      this.girosArray.clear();
      for (const g of res.girosNegocio) {
        this.girosArray.push(this.buildGiroGroup({
          codigo:              g.codigo,
          fuente:              'SII',
          descripcion:         g.descripcion,
          categoriaTributaria: g.categoriaTributaria,
          afectoIva:           g.indicadorAfectoIva === 'S',
          fechaInicio:         g.fechaInicio,
          esPrincipal:         false,
        }));
      }
      this.girosOrigen = 'sii';
    }
  }

  /** EB-01: verifica si el RUT ya está registrado en la plataforma */
  async checkRutRegistrado(rut: string): Promise<void> {
    const clean = rut.replace(/[.\- ]/g, '');
    this.rutYaRegistrado = null;
    this.joinSuccess = false;
    try {
      const res = await firstValueFrom(
        this.http
          .get<{ exists: boolean; organizacion?: { id: string; razonSocial: string; tipoPersona: string; tipoParticipante: string; giros: GiroComercial[] } }>(
            '/api/bff/organizacion/check-rut',
            { params: { rut: clean }, withCredentials: true },
          )
          .pipe(timeout(8_000)),
      );
      if (res?.exists && res.organizacion) {
        this.rutYaRegistrado = res.organizacion;
        this.step1.get('razonSocial')!.setValue(res.organizacion.razonSocial);
        this.step1.get('razonSocial')!.disable();

        if (res.organizacion.tipoPersona) {
          this.step1.get('tipoPersona')!.setValue(res.organizacion.tipoPersona, { emitEvent: false });
          this.step1.get('tipoPersona')!.disable();
        }
        if (res.organizacion.tipoParticipante) {
          const participante = res.organizacion.tipoParticipante as TipoParticipante;
          this.tipoParticipacion = participante;
          this.step1.get('tipoParticipante')!.setValue(participante, { emitEvent: false });
          this.step1.get('tipoParticipante')!.disable();
        }

        // Poblar giros desde nuestra BD (evita llamar al SII)
        this.girosArray.clear();
        for (const g of res.organizacion.giros ?? []) {
          this.girosArray.push(this.buildGiroGroup(g));
        }
        this.girosOrigen = 'bd';
      }
    } catch {
      // Silently fail — no bloquear al usuario si el check falla
    }
  }

  openJoinModal(): void {
    this.showJoinModal = true;
    this.joinError = null;
    this.joinSuccess = false;
  }

  closeJoinModal(): void {
    this.showJoinModal = false;
  }

  async requestJoinOrg(): Promise<void> {
    if (!this.rutYaRegistrado) return;
    this.joinSending = true;
    this.joinError = null;
    try {
      await firstValueFrom(
        this.http.post(
          `/api/bff/organizacion/${this.rutYaRegistrado.id}/solicitud-ingreso`,
          {},
          { withCredentials: true },
        ),
      );
      this.joinSuccess = true;
    } catch {
      this.joinError = 'No fue posible enviar la solicitud. Por favor intenta de nuevo.';
    } finally {
      this.joinSending = false;
    }
  }

  /** CA-05: el usuario acepta la razón social sugerida por el SII */
  acceptSiiRazonSocial(): void {
    if (this.siiRazonSocialHint) {
      this.step1.get('razonSocial')!.setValue(this.siiRazonSocialHint);
      this.siiRazonSocialHint = null;
    }
  }

  // ── Get Catalogos ────────────────────────────────────────────────────────────

  async loadRegiones(pais: string): Promise<void> {
    this.loadingRegiones = true;
    try {
      const res = await firstValueFrom(
        this.http.get<ApiResp<GeoOption[]>>('/api/bff/catalogo/geo/regiones', {
          params: { pais },
          withCredentials: true,
        }),
      );
      this.regiones = res?.data ?? [];
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
        this.http.get<ApiResp<GeoOption[]>>('/api/bff/catalogo/geo/provincias', {
          params: { region_id: region },
          withCredentials: true,
        }),
      );
      this.provincias = res?.data ?? [];
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
        this.http.get<ApiResp<GeoOption[]>>('/api/bff/catalogo/geo/comunas', {
          params: { provincia_id: provincia },
          withCredentials: true,
        }),
      );
      this.comunas = res?.data ?? [];
    } catch {
      this.comunas = [];
    } finally {
      this.loadingComunas = false;
    }
  }

  async loadBancos(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<ApiResp<{ id: string; nombre: string }[]>>('/api/bff/catalogo/bancos', {
          withCredentials: true,
        }),
      );
      this.bancos = res?.data ?? [];
    } catch {
      this.bancos = [];
    }
  }

  async loadProductosFinancieros(): Promise<void> {
    this.loadingProductos = true;
    try {
      const res = await firstValueFrom(
        this.http.get<ApiResp<ProductoFinanciero[]>>('/api/bff/catalogo/productos-financieros', {
          withCredentials: true,
        }),
      );
      this.productosFinancieros = res?.data ?? [];
    } catch {
      this.productosFinancieros = [];
    } finally {
      this.loadingProductos = false;
    }
  }

  async loadRegionesCobertura(pais: string): Promise<void> {
    this.loadingRegionesCobertura = true;
    try {
      const res = await firstValueFrom(
        this.http.get<ApiResp<GeoOption[]>>('/api/bff/catalogo/geo/regiones', {
          params: { pais },
          withCredentials: true,
        }),
      );
      this.regionesCobertura = res?.data ?? [];
    } catch {
      this.regionesCobertura = [];
    } finally {
      this.loadingRegionesCobertura = false;
    }
  }

  // ── Giros comerciales (FormArray helpers) ────────────────────────────────────

  get girosArray(): FormArray {
    return this.step1.get('giros') as FormArray;
  }

  private buildGiroGroup(g: Partial<GiroComercial>): FormGroup {
    return this.fb.group({
      codigo:              [g.codigo ?? ''],
      fuente:             [g.fuente ?? 'MANUAL', Validators.required],
      descripcion:        [g.descripcion ?? '', Validators.required],
      categoriaTributaria:[g.categoriaTributaria ?? ''],
      afectoIva:          [g.afectoIva ?? false],
      fechaInicio:        [g.fechaInicio ?? ''],
      esPrincipal:        [g.esPrincipal ?? false],
    });
  }

  removeGiro(i: number): void {
    this.girosArray.removeAt(i);
  }

  cancelAddGiro(): void {
    this.showAddGiro = false;
    this.newGiroCodigo = '';
    this.newGiroDesc = '';
  }

  confirmAddGiro(): void {
    if (!this.newGiroDesc.trim()) return;
    this.girosArray.push(this.buildGiroGroup({
      codigo:      this.newGiroCodigo.trim(),
      fuente:      'MANUAL',
      descripcion: this.newGiroDesc.trim(),
    }));
    this.girosOrigen = 'manual';
    this.showAddGiro = false;
    this.newGiroCodigo = '';
    this.newGiroDesc = '';
  }

  // ── Cobertura geográfica (FormArray helpers) ─────────────────────────────────

  get zonasCobertura(): FormArray {
    return this.step3Cobertura.get('zonas') as FormArray;
  }

  addZonaCobertura(): void {
    const zona = this.fb.group({
      pais: ['CL', Validators.required],
      regionId: ['', Validators.required],
      esPrincipal: [false],
    });
    zona.get('pais')!.valueChanges
      .pipe(takeUntil(this.destroy$), distinctUntilChanged())
      .subscribe((p: string | null) => {
        zona.get('regionId')!.setValue('');
        if (p) this.loadRegionesCobertura(p);
      });
    this.zonasCobertura.push(zona);
    this.loadRegionesCobertura('CL');
  }

  removeZonaCobertura(index: number): void {
    this.zonasCobertura.removeAt(index);
  }

  // ── Productos financieros (toggle helper) ────────────────────────────────────

  toggleProducto(id: string): void {
    const ctrl = this.step4Perfil.get('productosIds')!;
    const current: string[] = ctrl.value ?? [];
    const updated = current.includes(id)
      ? current.filter(p => p !== id)
      : [...current, id];
    ctrl.setValue(updated);
  }

  isProductoSelected(id: string): boolean {
    return ((this.step4Perfil.get('productosIds')?.value ?? []) as string[]).includes(id);
  }

  // ── Draft recovery ───────────────────────────────────────────────────────────

  async checkExistingDraft(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{
          id: string;
          lastStep: number;
          data: Record<string, unknown>;
        }>('/api/organizacion/me/draft', { withCredentials: true }),
      );
      if (res?.id) {
        this.orgId = res.id;
        this.restoreDraftData(res.data, res.lastStep);
      }
    } catch {
      /* no draft in progress */
    }
  }

  restoreDraftData(data: Record<string, unknown>, lastStep: number): void {
    if (data['step1']) {
      const s1 = data['step1'] as Record<string, unknown>;
      this.step1.patchValue(s1);
      if (Array.isArray(s1['giros'])) {
        this.girosArray.clear();
        for (const g of s1['giros'] as GiroComercial[]) {
          this.girosArray.push(this.buildGiroGroup(g));
        }
      }
    }
    if (data['step2']) {
      const s2 = data['step2'] as Record<string, unknown>;
      if (s2['region']) this.step2.get('provincia')!.enable();
      if (s2['provincia']) this.step2.get('comuna')!.enable();
      this.step2.patchValue(s2);
    }
    if (data['step3Cedente']) this.step3Cedente.patchValue(data['step3Cedente']);
    if (data['step3Cobertura']) this.step3Cobertura.patchValue(data['step3Cobertura']);
    if (data['step4Perfil']) this.step4Perfil.patchValue(data['step4Perfil']);
    if (data['step5']) this.step5.patchValue(data['step5']);
    if (data['step6']) this.step6.patchValue(data['step6']);
    setTimeout(() => { this.currentStep = lastStep; }, 150);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────

  get esCedente(): boolean { return this.tipoParticipacion === 'CEDENTE'; }
  get esFinancieraBroker(): boolean { return !this.esCedente; }

  get step3(): FormGroup {
    return this.esCedente ? this.step3Cedente : this.step3Cobertura;
  }

  get step4(): FormGroup {
    return this.esFinancieraBroker ? this.step4Perfil : this.step5;
  }

  get canAdvanceStep1(): boolean {
    return (
      this.step1.valid &&
      this.girosArray.length > 0 &&
      this.siiStatus !== 'blocked' &&
      this.siiStatus !== 'loading' &&
      !this.rutYaRegistrado
    );
  }

  get canAdvanceStep2(): boolean { return this.step2.valid; }
  get canAdvanceStep3(): boolean { return this.step3.valid; }
  get canAdvanceStep4(): boolean {
    return this.esFinancieraBroker ? this.step4Perfil.valid : true;
  }

  // ── Step advancement with incremental save ────────────────────────────────────

  async advanceStep(stepIndex: number): Promise<void> {
    this.saveError = null;
    this.saving = true;
    try {
      if (stepIndex === 0) {
        const v = this.step1.getRawValue();
        this.tipoParticipacion = v.tipoParticipante;
        const body: OrganizacionBodyDTO = {
          tipoPersona: v.tipoPersona,
          tipoParticipacion: v.tipoParticipante,
          rut: v.rut,
          razonSocial: v.razonSocial,
          giros: v.giros as GiroComercial[],
          rawSii: this.siiRawResult,
        };
        if (this.orgId) {
          await firstValueFrom(
            this.http.patch(`/api/bff/organizacion/${this.orgId}`, body, { withCredentials: true }),
          );
        } else {
          const res = await firstValueFrom(
            this.http.post<{ id: string }>('/api/bff/organizacion', body, { withCredentials: true }),
          );
          this.orgId = res.id;
        }
      } else if (stepIndex === 1) {

        await firstValueFrom(
          this.http.patch(
            `/api/bff/organizacion/${this.orgId}`,
            { direccion: this.step2.value },
            { withCredentials: true },
          ),
        );
      } else if (stepIndex === 2) {
        const payload = this.esCedente
          ? { cuentaBancaria: this.step3Cedente.value }
          : { coberturaGeografica: this.step3Cobertura.value };
        await firstValueFrom(
          this.http.patch(`/api/bff/organizacion/${this.orgId}`, payload, { withCredentials: true }),
        );
      } else if (stepIndex === 3 && this.esFinancieraBroker) {
        await firstValueFrom(
          this.http.patch(
            `/api/bff/organizacion/${this.orgId}`,
            { perfilOperativo: this.step4Perfil.value },
            { withCredentials: true },
          ),
        );
      }
      this.currentStep++;
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
        : {
          ...this.step5.value,
          notificaciones: this.step6.value,
          estado: 'ACTIVA',
        };
      await firstValueFrom(
        this.http.patch(`/api/bff/organizacion/${this.orgId}/finalize`, body, {
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
