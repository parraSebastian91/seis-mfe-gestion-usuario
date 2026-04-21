import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ObjectUploadService, UserProfile, UserProfileService, UserImageProfile, UserStateService } from 'shared-utils';

const PATH_TYPES = {
  USER_AVATAR: 'user-avatar',
  USER_BANNER: 'user-banner',
  DOCUMENT: 'documents',
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

  private readonly maxAvatarSizeBytes = 5 * 1024 * 1024;
  private readonly apiBase = 'http://localhost:8000';

  readonly defaultAvatarImage = DEFAULT_AVATAR_IMAGE;
  readonly defaultBannerImage = DEFAULT_BANNER_IMAGE;

  bannerLoaded = false;
  avatarLoaded = false;
  avatarImageSrc = this.defaultAvatarImage;
  bannerImageSrc = this.defaultBannerImage;

  showEditGeneralInfoForm: boolean = false;
  editGeneralInfoForm!: FormGroup;

  userProfile: UserProfile = {
    username: 'username',
    nombreCompleto: 'Nombre Completo',
    nombre: {
      nombres: 'Nombres',
      apellidoPaterno: 'Apellido Paterno',
      apellidoMaterno: 'Apellido Materno'
    },
    datosContacto: {
      tipoContacto: 'Tipo de Contacto',
      correo: 'correo@empresa.com',
      telefono: '123456789',
      ubicacion: 'Ubicación',
      documento: {
        tipo: 'Tipo de Documento',
        numero: 'Número de Documento'
      },
    },
    rrss: [
      { tipo: 'LinkedIn', enlace: 'https://www.linkedin.com/in/usuario' },
      { tipo: 'Twitter', enlace: 'https://twitter.com/usuario' }
    ],
    assets: {
      avatar: {
        sm: { format: 'png', headers: '', height: 50, width: 50, path: DEFAULT_AVATAR_IMAGE },
        md: { format: 'png', headers: '', height: 100, width: 100, path: DEFAULT_AVATAR_IMAGE },
        lg: { format: 'png', headers: '', height: 200, width: 200, path: DEFAULT_AVATAR_IMAGE }
      },
      banner: {
        sm: { format: 'png', headers: '', height: 100, width: 300, path: DEFAULT_BANNER_IMAGE },
        md: { format: 'png', headers: '', height: 200, width: 600, path: DEFAULT_BANNER_IMAGE },
        lg: { format: 'png', headers: '', height: 400, width: 1200, path: DEFAULT_BANNER_IMAGE }
      }
    },
    cargo: 'Cargo en la Empresa',
    telefono: '123456789',
    ubicacion: 'Ubicación'
  }

  constructor(
    private router: Router,
    private fb: FormBuilder,
    private userProfileService: UserProfileService,
    private objectUploadService: ObjectUploadService,
    private userStateService: UserStateService
  ) {
    this.editGeneralInfoForm = this.fb.group({
      nombres: ['', Validators.required],
      apellidoPaterno: ['', Validators.required],
      apellidoMaterno: [''],
      cargo: ['', Validators.required],
      correo: ['', [Validators.required, Validators.email]],
      telefono: ['', Validators.required],
      ubicacion: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.setAvatarImage(this.userProfile.assets.avatar.md.path);
    this.setBannerImage(this.userProfile.assets.banner.lg.path);

    this.userStateService.patch({ status: 'LOADING' });

    console.log('Obteniendo perfil del usuario...');
    this.userProfileService.getUserProfile()
      .then((profile: UserProfile) => {

        console.log('Perfil del usuario:', profile);
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
          email: profile.datosContacto?.correo || ''
        });

        this.syncFormWithProfile();
      }).catch((err: any) => {
        console.error('Error al obtener el perfil del usuario:', err);
        this.userStateService.setStatus('ERROR');
      });

    this.userProfileService.getUserImage(this.apiBase)
      .then((imageUrl: UserImageProfile) => {
        this.userProfile.assets.avatar = imageUrl.avatar;
        this.userProfile.assets.banner = imageUrl.banner;
        this.setAvatarImage(imageUrl.avatar.md.path || imageUrl.avatar.sm.path);
        this.setBannerImage(imageUrl.banner.lg.path || imageUrl.banner.md.path || imageUrl.banner.sm.path);

        this.userStateService.setAvatar({
          small: imageUrl.avatar.sm.path,
          medium: imageUrl.avatar.md.path,
          large: imageUrl.avatar.lg.path
        });

        this.userStateService.setBanner({
          small: imageUrl.banner.sm.path,
          medium: imageUrl.banner.md.path,
          large: imageUrl.banner.lg.path
        });

        this.userStateService.setStatus('READY');
      }).catch((err: any) => {
        console.warn('Usuario sin imagen', err);
        this.userStateService.setStatus('READY');
      });
    this.syncFormWithProfile();
  }

  logout() {
    // Aquí puedes agregar la lógica para cerrar sesión, como limpiar tokens, redirigir, etc.
    console.log('Cerrar sesión');
  }

  goTo(edit: string) {
    // Aquí puedes agregar la lógica para navegar a la página de edición, por ejemplo usando el router
    console.log('Navegar a:', edit);
    this.router.navigate([edit]);
  }

  openEditGeneralInfo() {
    this.syncFormWithProfile();
    this.showEditGeneralInfoForm = true;
  }

  cancelEditGeneralInfo() {
    this.showEditGeneralInfoForm = false;
    this.syncFormWithProfile();
  }

  saveGeneralInformation() {
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
        console.log('Perfil actualizado exitosamente');

        this.userStateService.patch({
          username: this.userProfile.username,
          NombreCompleto: this.userProfile.nombreCompleto,
          email: this.userProfile.datosContacto?.correo || ''
        });
      })
      .catch((err: any) => {
        console.error('Error updating user profile:', err);
      });


    this.showEditGeneralInfoForm = false;
  }

  openAvatarFilePicker(fileInput: HTMLInputElement) {
    fileInput.click();
  }

  async onBannerFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      console.error('El archivo seleccionado no es una imagen.');
      input.value = '';
      return;
    }

    if (file.size > this.maxAvatarSizeBytes) {
      console.error('La imagen supera el tamaño máximo de 5MB.');
      input.value = '';
      return;
    }

    this.previewBanner(file);

    try {
      const presignedUrl = await this.objectUploadService.getPresignedPutUrl(this.apiBase, PATH_TYPES.USER_BANNER, file.name, file.type);
      if (presignedUrl?.url) {
        console.log(file);
        await this.objectUploadService.uploadToPresignedUrl(presignedUrl.url, file).then(() => {
          // this.userProfile.avatar.urls.sm = presignedUrl.url.split('?')[0];
          // this.userProfile.avatar.urls.md = presignedUrl.url.split('?')[0];
        }).catch((err) => {
          console.error('Error al subir la imagen al presigned URL:', err);
        });
      }
    } catch (err) {
      console.error('Error al cargar avatar:', err);
    } finally {
      input.value = '';
    }
  }

  async onAvatarFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      console.error('El archivo seleccionado no es una imagen.');
      input.value = '';
      return;
    }

    if (file.size > this.maxAvatarSizeBytes) {
      console.error('La imagen supera el tamaño máximo de 5MB.');
      input.value = '';
      return;
    }

    this.previewAvatar(file);

    try {
      const presignedUrl = await this.objectUploadService.getPresignedPutUrl(this.apiBase, PATH_TYPES.USER_AVATAR, file.name, file.type);
      if (presignedUrl?.url) {
        console.log(file);
        await this.objectUploadService.uploadToPresignedUrl(presignedUrl.url, file).then(() => {
          // this.userProfile.avatar.urls.sm = presignedUrl.url.split('?')[0];
          // this.userProfile.avatar.urls.md = presignedUrl.url.split('?')[0];
        }).catch((err) => {
          console.error('Error al subir la imagen al presigned URL:', err);
        });
      }
    } catch (err) {
      console.error('Error al cargar avatar:', err);
    } finally {
      input.value = '';
    }
  }

  private previewAvatar(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const imageDataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageDataUrl) {
        return;
      }

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
