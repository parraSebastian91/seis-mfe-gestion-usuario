import { Component, Inject, OnInit } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidatorFn, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  LOGIN_APP_URL,
  ObjectUploadService,
  SessionService,
  UserImageProfile,
  UserProfile,
  UserProfileService,
  UserStateService,
} from 'shared-utils';

const PATH_TYPES = {
  USER_AVATAR: 'user-avatar',
  USER_BANNER: 'user-banner',
};

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type StrengthLevel = 0 | 1 | 2 | 3 | 4;

function calcStrength(value: string): StrengthLevel {
  if (!value) return 0;
  let score = 0;
  if (value.length >= 8) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z\d]/.test(value)) score++;
  return Math.min(score, 4) as StrengthLevel;
}

const passwordMatchValidator: ValidatorFn = (group: AbstractControl) => {
  const np = group.get('newPassword')?.value ?? '';
  const cp = group.get('confirmPassword')?.value ?? '';
  return np === cp ? null : { mismatch: true };
};

const DEFAULT_AVATAR_IMAGE = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 256 256%22%3E%3Cdefs%3E%3ClinearGradient id=%22g%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%221%22%3E%3Cstop offset=%220%25%22 stop-color=%22%23eaf2ff%22/%3E%3Cstop offset=%22100%25%22 stop-color=%22%23cfddf7%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%22256%22 height=%22256%22 fill=%22url(%23g)%22/%3E%3Ccircle cx=%22128%22 cy=%2294%22 r=%2248%22 fill=%22%23ffffff%22 fill-opacity=%220.82%22/%3E%3Crect x=%2260%22 y=%22154%22 width=%22136%22 height=%2264%22 rx=%2232%22 fill=%22%23ffffff%22 fill-opacity=%220.82%22/%3E%3C/svg%3E';
const DEFAULT_BANNER_IMAGE = 'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1200 400%22%3E%3Cdefs%3E%3ClinearGradient id=%22bg%22 x1=%220%22 y1=%220%22 x2=%221%22 y2=%220%22%3E%3Cstop offset=%220%25%22 stop-color=%22%23dbe8ff%22/%3E%3Cstop offset=%2250%25%22 stop-color=%22%23bfd8ff%22/%3E%3Cstop offset=%22100%25%22 stop-color=%22%23a4c4f6%22/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width=%221200%22 height=%22400%22 fill=%22url(%23bg)%22/%3E%3Ccircle cx=%22980%22 cy=%22-30%22 r=%22280%22 fill=%22%23ffffff%22 fill-opacity=%220.33%22/%3E%3Ccircle cx=%22180%22 cy=%22440%22 r=%22310%22 fill=%22%23ffffff%22 fill-opacity=%220.24%22/%3E%3C/svg%3E';

@Component({
  selector: 'app-view',
  standalone: false,
  templateUrl: './view.component.html',
  styleUrl: './view.component.scss'
})
export class ViewComponent implements OnInit {

  private readonly maxFileSizeBytes = 5 * 1024 * 1024;
  private readonly apiBase = 'http://localhost:8000';

  readonly defaultAvatarImage = DEFAULT_AVATAR_IMAGE;
  readonly defaultBannerImage = DEFAULT_BANNER_IMAGE;

  // ── Image state ──────────────────────────────────────────────────────────
  bannerLoaded = false;
  avatarLoaded = false;
  avatarImageSrc = this.defaultAvatarImage;
  bannerImageSrc = this.defaultBannerImage;

  // ── Profile mode (CA-03) ─────────────────────────────────────────────────
  readonly isOwnProfile: boolean;

  // ── Información General form ──────────────────────────────────────────────
  showEditGeneralInfoForm = false;
  editGeneralInfoForm!: FormGroup;

  // ── Redes Sociales (CA-07) ────────────────────────────────────────────────
  showSocialForm = false;
  editingSocialIndex: number | null = null;
  socialForm!: FormGroup;
  readonly socialTypes = ['LinkedIn', 'Twitter/X', 'Sitio Web'];

  // ── Cambio de contraseña (CA-09) ──────────────────────────────────────────
  showPasswordForm = false;
  passwordSaving = false;
  passwordErrorMsg = '';
  passwordSuccessMsg = '';
  showCurrentPw = false;
  showNewPw = false;
  showConfirmPw = false;
  strengthLevel: StrengthLevel = 0;
  readonly STRENGTH_CLASSES: Record<number, string> = {
    1: 'danger', 2: 'warning', 3: 'good', 4: 'strong',
  };
  readonly STRENGTH_LABELS: Record<number, string> = {
    1: 'Muy débil', 2: 'Débil', 3: 'Buena', 4: 'Fuerte',
  };
  passwordForm!: FormGroup;

  defaultAsset = {
    sm: { format: 'png', headers: '', height: 50, width: 50, path: DEFAULT_AVATAR_IMAGE },
    md: { format: 'png', headers: '', height: 100, width: 100, path: DEFAULT_AVATAR_IMAGE },
    lg: { format: 'png', headers: '', height: 200, width: 200, path: DEFAULT_AVATAR_IMAGE },
  };

  userProfile: UserProfile = {
    username: 'username',
    usuarioUUID: 'usuarioUUID',
    nombreCompleto: 'Nombre Completo',
    nombre: {
      nombres: 'Nombres',
      apellidoPaterno: 'Apellido Paterno',
      apellidoMaterno: 'Apellido Materno',
    },
    datosContacto: {
      tipoContacto: '',
      correo: 'correo@empresa.com',
      telefono: '123456789',
      ubicacion: 'Ubicación',
      documento: { tipo: '', numero: '' },
    },
    rrss: [
      { tipo: 'LinkedIn', enlace: 'https://www.linkedin.com/in/usuario' },
    ],
    assets: {
      avatar: {
        sm: { format: 'png', headers: '', height: 50, width: 50, path: DEFAULT_AVATAR_IMAGE },
        md: { format: 'png', headers: '', height: 100, width: 100, path: DEFAULT_AVATAR_IMAGE },
        lg: { format: 'png', headers: '', height: 200, width: 200, path: DEFAULT_AVATAR_IMAGE },
      },
      banner: {
        sm: { format: 'png', headers: '', height: 100, width: 300, path: DEFAULT_BANNER_IMAGE },
        md: { format: 'png', headers: '', height: 200, width: 600, path: DEFAULT_BANNER_IMAGE },
        lg: { format: 'png', headers: '', height: 400, width: 1200, path: DEFAULT_BANNER_IMAGE },
      },
    },
    cargo: 'Cargo en la Empresa',
    telefono: '123456789',
    ubicacion: 'Ubicación',
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly fb: FormBuilder,
    private readonly http: HttpClient,
    private readonly userProfileService: UserProfileService,
    private readonly objectUploadService: ObjectUploadService,
    private readonly userStateService: UserStateService,
    private readonly session: SessionService,
    @Inject(LOGIN_APP_URL) private readonly loginAppUrl: string,
  ) {
    this.isOwnProfile = !this.route.snapshot.params['username'];

    this.editGeneralInfoForm = this.fb.group({
      nombres: ['', Validators.required],
      apellidoPaterno: ['', Validators.required],
      apellidoMaterno: [''],
      cargo: ['', Validators.required],
      correo: ['', [Validators.required, Validators.email]],
      telefono: ['', Validators.required],
      ubicacion: ['', [Validators.required, Validators.maxLength(200)]],
    });

    this.socialForm = this.fb.group({
      tipo: ['LinkedIn', Validators.required],
      enlace: ['', [Validators.required, Validators.pattern(/^https?:\/\/.+/)]],
    });

    this.passwordForm = this.fb.group(
      {
        currentPassword: ['', Validators.required],
        newPassword: ['', [
          Validators.required,
          Validators.minLength(8),
          Validators.pattern(/^(?=.*[A-Z])(?=.*\d).+$/),
        ]],
        confirmPassword: ['', Validators.required],
      },
      { validators: passwordMatchValidator },
    );

    this.passwordForm.get('newPassword')!.valueChanges.subscribe(val => {
      this.strengthLevel = calcStrength(val ?? '');
    });
  }

  ngOnInit(): void {
    this.setAvatarImage(this.userProfile.assets.avatar.md.path);
    this.setBannerImage(this.userProfile.assets.banner.lg.path);
    this.userStateService.patch({ status: 'LOADING' });

    this.userProfileService.getUserProfile()
      .then((profile: UserProfile) => {
        this.userProfile.username = profile.username;
        this.userProfile.nombreCompleto = profile.nombreCompleto;
        this.userProfile.nombre = profile.nombre;
        this.userProfile.datosContacto = profile.datosContacto;
        this.userProfile.rrss = profile.rrss;
        this.userProfile.cargo = profile.cargo;
        this.userProfile.telefono = profile.telefono;
        this.userProfile.ubicacion = profile.ubicacion;

        this.userStateService.patch({
          username: profile.username,
          NombreCompleto: profile.nombreCompleto,
          email: profile.datosContacto?.correo ?? '',
        });
        this.syncFormWithProfile();
      })
      .catch(() => this.userStateService.setStatus('ERROR'));

    this.userProfileService.getUserImage(this.apiBase)
      .then((imageUrl: UserImageProfile) => {
        this.userProfile.assets.avatar = imageUrl.avatar;
        this.userProfile.assets.banner = imageUrl.banner;

        if (imageUrl.avatar.sm) {
          this.setAvatarImage(imageUrl.avatar.md.path || imageUrl.avatar.sm.path);
          this.userStateService.setAvatar({
            small: imageUrl.avatar.sm.path,
            medium: imageUrl.avatar.md.path,
            large: imageUrl.avatar.lg.path,
          });
        }

        if (imageUrl.banner.sm) {
          this.setBannerImage(imageUrl.banner.lg.path || imageUrl.banner.md.path || imageUrl.banner.sm.path);
          this.userStateService.setBanner({
            small: imageUrl.banner.sm.path,
            medium: imageUrl.banner.md.path,
            large: imageUrl.banner.lg.path,
          });
        }

        this.userStateService.setStatus('READY');
      })
      .catch(() => this.userStateService.setStatus('READY'));

    this.syncFormWithProfile();
  }

  // ── CA-02 · Logout ────────────────────────────────────────────────────────
  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.get('/api/auth/security/logout'));
    } catch { /* silent */ }
    this.session.clearSession();
    globalThis.location.href = this.loginAppUrl;
  }

  // ── Información General ───────────────────────────────────────────────────
  openEditGeneralInfo(): void {
    this.syncFormWithProfile();
    this.showEditGeneralInfoForm = true;
  }

  cancelEditGeneralInfo(): void {
    this.showEditGeneralInfoForm = false;
    this.syncFormWithProfile();
  }

  saveGeneralInformation(): void {
    if (this.editGeneralInfoForm.invalid) {
      this.editGeneralInfoForm.markAllAsTouched();
      return;
    }

    const formValue = this.editGeneralInfoForm.value;
    this.userProfile.nombre.nombres = formValue.nombres;
    this.userProfile.nombre.apellidoPaterno = formValue.apellidoPaterno;
    this.userProfile.nombre.apellidoMaterno = formValue.apellidoMaterno;
    this.userProfile.cargo = formValue.cargo;
    this.userProfile.datosContacto.correo = formValue.correo;
    this.userProfile.telefono = formValue.telefono;
    this.userProfile.ubicacion = formValue.ubicacion;
    this.userProfile.nombreCompleto = [
      formValue.nombres,
      formValue.apellidoPaterno,
      formValue.apellidoMaterno,
    ].filter(Boolean).join(' ');

    this.userProfileService.updateUserProfile(this.apiBase, this.userProfile)
      .then(() => {
        // EB-01: sync SessionService so navbar/sidebar update reactively
        const currentUser = this.session.user();
        if (currentUser) {
          this.session.setSession(
            { ...currentUser, nombre: formValue.nombres, apellido: formValue.apellidoPaterno, correo: formValue.correo },
            this.session.activeOrg(),
          );
        }
        this.userStateService.patch({
          username: this.userProfile.username,
          NombreCompleto: this.userProfile.nombreCompleto,
          email: this.userProfile.datosContacto?.correo ?? '',
        });
      })
      .catch(() => { /* toast in future */ });

    this.showEditGeneralInfoForm = false;
  }

  // ── CA-07 · Redes Sociales ────────────────────────────────────────────────
  openAddSocial(): void {
    this.editingSocialIndex = null;
    this.socialForm.reset({ tipo: 'LinkedIn', enlace: '' });
    this.showSocialForm = true;
  }

  editSocial(index: number): void {
    this.editingSocialIndex = index;
    const red = this.userProfile.rrss[index];
    this.socialForm.setValue({ tipo: red.tipo, enlace: red.enlace });
    this.showSocialForm = true;
  }

  saveSocial(): void {
    if (this.socialForm.invalid) {
      this.socialForm.markAllAsTouched();
      return;
    }
    const { tipo, enlace } = this.socialForm.value;
    if (this.editingSocialIndex === null) {
      this.userProfile.rrss = [...this.userProfile.rrss, { tipo, enlace }];
    } else {
      this.userProfile.rrss[this.editingSocialIndex] = { tipo, enlace };
    }
    this.persistRrss();
    this.cancelSocial();
  }

  cancelSocial(): void {
    this.showSocialForm = false;
    this.editingSocialIndex = null;
    this.socialForm.reset({ tipo: 'LinkedIn', enlace: '' });
  }

  removeSocial(index: number): void {
    this.userProfile.rrss = this.userProfile.rrss.filter((_, i) => i !== index);
    this.persistRrss();
  }

  private persistRrss(): void {
    this.userProfileService.updateUserProfile(this.apiBase, this.userProfile)
      .catch(() => { /* toast in future */ });
  }

  // ── CA-09 · Cambio de contraseña ──────────────────────────────────────────
  openPasswordForm(): void {
    this.showPasswordForm = true;
    this.passwordErrorMsg = '';
    this.passwordSuccessMsg = '';
    this.passwordForm.reset();
    this.strengthLevel = 0;
  }

  cancelPasswordChange(): void {
    this.showPasswordForm = false;
    this.passwordForm.reset();
    this.strengthLevel = 0;
  }

  async savePasswordChange(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.passwordSaving = true;
    this.passwordErrorMsg = '';
    const { currentPassword, newPassword } = this.passwordForm.value;
    try {
      await firstValueFrom(
        this.http.post('/api/auth/security/password-reset/change', { currentPassword, newPassword }),
      );
      this.passwordSuccessMsg = 'Contraseña actualizada correctamente.';
      this.passwordForm.reset();
      this.strengthLevel = 0;
      setTimeout(() => this.cancelPasswordChange(), 2500);
    } catch (err: unknown) {
      const httpErr = err as { status?: number };
      this.passwordErrorMsg = httpErr?.status === 401 || httpErr?.status === 403
        ? 'Contraseña actual incorrecta.'
        : 'No se pudo actualizar la contraseña. Intenta nuevamente.';
    } finally {
      this.passwordSaving = false;
    }
  }

  openAvatarFilePicker(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  async onBannerFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) { input.value = ''; return; }
    if (file.size > this.maxFileSizeBytes) { input.value = ''; return; }

    this.previewBanner(file);
    try {
      await this.objectUploadService.uploadFileUsingPresignedUrl(this.apiBase, PATH_TYPES.USER_BANNER, file, this.userProfile.username);
    } catch { /* toast in future */ } finally {
      input.value = '';
    }
  }

  async onAvatarFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) { input.value = ''; return; }
    if (file.size > this.maxFileSizeBytes) { input.value = ''; return; }

    this.previewAvatar(file);
    try {
      await this.objectUploadService.uploadFileUsingPresignedUrl(this.apiBase, PATH_TYPES.USER_AVATAR, file, this.userProfile.username);
    } catch { /* toast in future */ } finally {
      input.value = '';
    }
  }

  private previewAvatar(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const imageDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageDataUrl) return;
      if (!this.userProfile.assets.avatar.sm) this.userProfile.assets.avatar = this.defaultAsset;
      this.userProfile.assets.avatar.sm.path = imageDataUrl;
      this.userProfile.assets.avatar.md.path = imageDataUrl;
      this.setAvatarImage(imageDataUrl);
      this.userStateService.setAvatar({ small: imageDataUrl, medium: imageDataUrl, large: imageDataUrl });
    };
    reader.readAsDataURL(file);
  }

  private previewBanner(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const imageDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageDataUrl) {
        return;
      }

      this.userProfile.assets.banner.lg.path = imageDataUrl;
      this.setBannerImage(imageDataUrl);
      this.userStateService.setBanner({ small: imageDataUrl, medium: imageDataUrl, large: imageDataUrl });
    };
    reader.readAsDataURL(file);
  }

  onAvatarImageLoad() {
    this.avatarLoaded = true;
  }

  onAvatarImageError() {
    if (this.avatarImageSrc !== this.defaultAvatarImage) {
      this.setAvatarImage(this.defaultAvatarImage);
      return;
    }

    this.avatarLoaded = true;
  }

  onBannerImageLoad() {
    this.bannerLoaded = true;
  }

  onBannerImageError() {
    if (this.bannerImageSrc !== this.defaultBannerImage) {
      this.setBannerImage(this.defaultBannerImage);
      return;
    }

    this.bannerLoaded = true;
  }

  private setAvatarImage(imageUrl?: string) {
    this.avatarLoaded = false;
    this.avatarImageSrc = imageUrl || this.defaultAvatarImage;
  }

  private setBannerImage(imageUrl?: string) {
    this.bannerLoaded = false;
    this.bannerImageSrc = imageUrl || this.defaultBannerImage;
  }

  private syncFormWithProfile() {
    this.editGeneralInfoForm.patchValue({
      nombres: this.userProfile.nombre.nombres,
      apellidoPaterno: this.userProfile.nombre.apellidoPaterno,
      apellidoMaterno: this.userProfile.nombre.apellidoMaterno,
      cargo: this.userProfile.cargo,
      correo: this.userProfile.datosContacto.correo,
      telefono: this.userProfile.telefono,
      ubicacion: this.userProfile.ubicacion,
    });
  }

}
