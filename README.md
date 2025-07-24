# Cancionero Digital Interactivo

Un cancionero digital moderno construido con React y Firebase, diseñado para bandas y músicos. Permite gestionar un repertorio de canciones compartido, crear listas de actuaciones (setlists) personales y públicas, y transportar acordes en tiempo real.

---

## ✨ Características Principales

* **Repertorio Centralizado:** Todas las canciones de la banda en un solo lugar.
* **Transposición de Acordes:** Cambiá la tonalidad de cualquier canción al instante.
* **Visualización Clara:** Muestra los acordes sobre la letra, al estilo de las mejores páginas de cifrados.
* **Listas de Actuación (Setlists):**
    * **Públicas:** Creadas por administradores para toda la banda, con tonalidades definidas para cada evento.
    * **Privadas:** Cada miembro puede crear sus propias listas personales.
* **Sistema de Roles:**
    * **Admin:** Control total sobre el repertorio y la gestión de usuarios.
    * **Invitado:** Puede ver todo, transportar canciones y crear sus listas privadas.
* **Interfaz Personalizable:** Controles para ajustar el tamaño de la letra y cambiar entre tema claro y oscuro.
* **Seguro:** Sistema de autenticación por invitación para mantener tu repertorio privado.

---

## 🚀 Puesta en Marcha

Para instalar y correr este proyecto en tu propia máquina, seguí estos pasos.

### **Parte 1: Configuración de Firebase**

1.  **Creá un Proyecto en Firebase:** Andá a la [Consola de Firebase](https://console.firebase.google.com/) y creá un nuevo proyecto.
2.  **Activá los Servicios:**
    * **Authentication:** Habilitá el proveedor **"Correo electrónico/Contraseña"**.
    * **Firestore Database:** Creá una base de datos en **modo de producción**.
3.  **Creá tu Usuario Admin:**
    * En **Authentication**, creá tu primer usuario manualmente (ej: `tu-email@gmail.com`).
    * Copiá el **User UID** de tu nuevo usuario.
    * En **Firestore**, creá la siguiente estructura:
        * Colección `artifacts` -> Documento `[tu-project-id]` -> Colección `users` -> Documento `[tu-user-uid]`
    * En el documento de tu usuario, añadí dos campos: `email` (string) con tu email y `role` (string) con el valor `admin`.
4.  **Establecé las Reglas de Seguridad:** En la pestaña **Reglas** de Firestore, pegá el siguiente contenido:

    ```
    rules_version = '2';
    service cloud.firestore {
      match /databases/{database}/documents {
        
        match /artifacts/{appId}/users/{userId} {
          allow read: if request.auth != null;
          allow create: if request.auth.uid == userId;
          allow update: if request.auth != null && get(/databases/$(database)/documents/artifacts/$(appId)/users/$(request.auth.uid)).data.role == 'admin';
        }

        match /artifacts/{appId}/users/{userId}/setlists/{setlistId} {
          allow read, write: if request.auth != null && request.auth.uid == userId;
        }

        match /artifacts/{appId}/songs/{songId} {
          allow read: if request.auth != null;
          allow write: if request.auth != null && get(/databases/$(database)/documents/artifacts/$(appId)/users/$(request.auth.uid)).data.role == 'admin';
        }

        match /artifacts/{appId}/public_setlists/{setlistId} {
          allow read: if request.auth != null;
          allow write: if request.auth != null && get(/databases/$(database)/documents/artifacts/$(appId)/users/$(request.auth.uid)).data.role == 'admin';
        }

        match /artifacts/{appId}/invitations/{invitationId} {
          allow read: if request.auth != null;
          allow create, delete: if request.auth != null && get(/databases/$(database)/documents/artifacts/$(appId)/users/$(request.auth.uid)).data.role == 'admin';
        }
      }
    }
    ```

### **Parte 2: Instalación Local**

1.  **Cloná el Repositorio:**
    ```bash
    git clone [https://github.com/tu-usuario/tu-repositorio.git](https://github.com/tu-usuario/tu-repositorio.git)
    cd cancionero-digital
    ```
2.  **Creá tu Archivo de Entorno:**
    * Creá un archivo llamado `.env` en la raíz del proyecto.
    * Andá a la **Configuración de tu proyecto en Firebase**, registrá una nueva aplicación web y copiá las credenciales.
    * Pegá las credenciales en tu archivo `.env` con el siguiente formato:
        ```
        REACT_APP_API_KEY="AIza..."
        REACT_APP_AUTH_DOMAIN="tu-proyecto-id.firebaseapp.com"
        REACT_APP_PROJECT_ID="tu-proyecto-id"
        REACT_APP_STORAGE_BUCKET="tu-proyecto-id.appspot.com"
        REACT_APP_MESSAGING_SENDER_ID="..."
        REACT_APP_APP_ID="1:..."
        ```
3.  **Instalá las Dependencias:**
    ```bash
    npm install firebase lucide-react
    npm install -D tailwindcss postcss autoprefixer
    ```
4.  **Configurá Tailwind CSS:**
    * Ejecutá el comando para crear los archivos de configuración:
        ```bash
        npx tailwindcss init -p
        ```
    * Reemplazá el contenido de `tailwind.config.js` con esto:
        ```javascript
        /** @type {import('tailwindcss').Config} */
        module.exports = {
          darkMode: 'class',
          content: ["./src/**/*.{js,jsx,ts,tsx}"],
          theme: { extend: {} },
          plugins: [],
        }
        ```
    * Reemplazá el contenido de `src/index.css` con esto:
        ```css
        @tailwind base;
        @tailwind components;
        @tailwind utilities;
        ```

5.  **Ejecutá la Aplicación:**
    ```bash
    npm start
    ```
    La aplicación se abrirá en `http://localhost:3000`. ¡Iniciá sesión con el usuario admin que creaste!

---

## 🛠️ Stack Tecnológico

* **Frontend:** [React](https://reactjs.org/)
* **Backend & Base de Datos:** [Firebase](https://firebase.google.com/) (Authentication & Firestore)
* **Estilos:** [Tailwind CSS](https://tailwindcss.com/)
* **Iconos:** [Lucide React](https://lucide.dev/)