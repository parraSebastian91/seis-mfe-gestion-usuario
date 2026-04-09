import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ObjectUploadService, UserProfile, UserProfileService } from 'shared-utils';

const PATH_TYPES = {
  USER_AVATAR: 'user-avatar',
  USER_BANNER: 'user-banner',
  DOCUMENT: 'documents',
};

@Component({
  selector: 'app-view',
  standalone: false,
  templateUrl: './view.component.html',
  styleUrl: './view.component.scss'
})
export class ViewComponent implements OnInit {

  private readonly maxAvatarSizeBytes = 5 * 1024 * 1024;
  private readonly apiBase = 'http://localhost:8000';

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
    avatar: {
      name: 'Avatar Name',
      urls: {
        sm: 'https://i.pravatar.cc/50?img=3',
        md: 'https://i.pravatar.cc/50?img=3',
        lg: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200'
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
    private objectUploadService: ObjectUploadService
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

      this.userProfile.avatar.urls.sm = imageDataUrl;
      this.userProfile.avatar.urls.md = imageDataUrl;
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

      this.userProfile.avatar.urls.lg = imageDataUrl;
    };
    reader.readAsDataURL(file);
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

  ngOnInit(): void {
    console.log('Obteniendo perfil del usuario...');
    this.userProfileService.getUserProfile(this.apiBase, 'correo')
      .then((profile: UserProfile) => {

        console.log('Perfil del usuario:', profile);
        this.userProfile.username = profile.username;
        this.userProfile.nombreCompleto = profile.nombreCompleto;
        this.userProfile.nombre = profile.nombre;
        this.userProfile.datosContacto = profile.datosContacto;
        this.userProfile.rrss = profile.rrss;
        // this.userProfile.avatar = profile.avatar;
        this.userProfile.cargo = profile.cargo;
        this.userProfile.telefono = profile.telefono;
        this.userProfile.ubicacion = profile.ubicacion;
        this.syncFormWithProfile();

        // Aquí puedes asignar los datos del perfil a las variables para mostrarlos en la vista
      }).catch((err: any) => {
        console.error('Error al obtener el perfil del usuario:', err);
      });

    this.syncFormWithProfile();
  }

  loadUserProfile() {
    this.userProfileService.getUserProfile(this.apiBase, 'correo').then((profile: any) => {
      console.log('Perfil del usuario:', profile);
      // Aquí puedes asignar los datos del perfil a las variables para mostrarlos en la vista
    }).catch((err: any) => {
      console.error('Error al obtener el perfil del usuario:', err);
    });
  }
}
