import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserProfile, UserProfileService } from 'shared-utils';



@Component({
  selector: 'app-view',
  standalone: false,
  templateUrl: './view.component.html',
  styleUrl: './view.component.scss'
})
export class ViewComponent implements OnInit {

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
        sm: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200',
        md: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200',
        lg: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=1200'
      }
    },
    cargo: 'Cargo en la Empresa',
    telefono: '123456789',
    ubicacion: 'Ubicación'
  }

  constructor(
    private router: Router,
    private userProfileService: UserProfileService
  ) { }

  logout() {
    // Aquí puedes agregar la lógica para cerrar sesión, como limpiar tokens, redirigir, etc.
    console.log('Cerrar sesión');
  }

  goTo(edit: string) {
    // Aquí puedes agregar la lógica para navegar a la página de edición, por ejemplo usando el router
    console.log('Navegar a:', edit);
    this.router.navigate([edit]);
  }

  ngOnInit(): void {
    console.log('Obteniendo perfil del usuario...');
    this.userProfileService.getUserProfile('http://localhost:8000', 'correo')
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

        // Aquí puedes asignar los datos del perfil a las variables para mostrarlos en la vista
      }).catch((err: any) => {
        console.error('Error al obtener el perfil del usuario:', err);
      });
  }

  loadUserProfile() {
    this.userProfileService.getUserProfile('http://localhost:8000', 'correo').then((profile: any) => {
      console.log('Perfil del usuario:', profile);
      // Aquí puedes asignar los datos del perfil a las variables para mostrarlos en la vista
    }).catch((err: any) => {
      console.error('Error al obtener el perfil del usuario:', err);
    });
  }
}
