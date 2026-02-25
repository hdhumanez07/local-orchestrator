# 🏗️ BCS Mortgage Orchestrator

Bienvenido al orquestador de microservicios para el ecosistema **BCS Mortgage**. Esta herramienta está diseñada para facilitar el desarrollo local, permitiéndote gestionar múltiples servicios de NestJS desde una única interfaz web premium.

![Dashboard Preview](https://res.cloudinary.com/dm9rh1ypo/image/upload/v1772046800/Screenshot_2026-02-25_at_2.07.19_PM_ncpsp1.png)
![Dashboard Preview](https://res.cloudinary.com/dm9rh1ypo/image/upload/v1772046797/Screenshot_2026-02-25_at_2.08.16_PM_u6uqeq.png)

## 🚀 Características Principales

- **Gestión de Ciclo de Vida**: Inicia, detén y reinicia microservicios de forma individual o grupal.
- **Logs en Tiempo Real**: Visualiza los logs combinados de todos los servicios con streaming via WebSockets.
- **Filtros Inteligentes**: Filtra logs por nivel (Error, Info, Warn) o busca palabras clave.
- **Túneles Cloudflare**: Genera URLs públicas instantáneas para tus Gateways con un solo clic.
- **Acceso Directo a Código**: Abre cualquier microservicio directamente en **VS Code**, **Cursor** o **Antigravity** desde el dashboard.
- **Kill Nuclear**: Botón de pánico para limpiar todos los procesos de Node.js huérfanos en tu sistema.

## 🛠️ Requisitos e Instalación

### 1. Requisitos del Sistema

- **Node.js**: v16 o superior.
- **macOS / Linux**: (También funciona en Windows, pero está optimizado para Mac).
- **cloudflared**: Necesario si deseas usar la función de túneles públicos.
  ```bash
  brew install cloudflared
  ```
- **Editores CLI**: Asegúrate de tener instalados los comandos `code` (VS Code) y `cursor` (Cursor) en tu PATH.

### 2. Instalación del Orquestador

Clona este repositorio y ejecuta:

```bash
npm install
```

### 3. Estructura de Directorios (Importante)

El orquestador espera que los microservicios estén en el mismo nivel de carpeta que el orquestador:

```
/repos
  ├── bcs-mortgage-orchestrator (Este repo)
  ├── bcs-mortgage-api-gateway
  ├── bcs-mortgage-api-composer
  ├── bcs-mortgage-commons
  └── ... (otros microservicios)
```

## 🏃 Cómo usar

Para iniciar el orquestador:

```bash
npm start
```

Luego abre [http://localhost:9000](http://localhost:9000) en tu navegador.

## ⚙️ Configuración de Microservicios

La lista de servicios se encuentra en `server.js`. Si necesitas añadir uno nuevo, agrégalo al array `MICROSERVICES`:

```javascript
{
  id: 'nuevo-servicio',
  name: 'Nuevo Servicio',
  path: path.join(BASE_PATH, 'bcs-mortgage-nuevo'),
  port: 3008,
  color: '#FF5733',
  icon: '🚀',
  description: 'Descripción del servicio',
}
```

## 💡 Tips de Desarrollo

1.  **Limpieza de Logs**: Si los logs se ven con caracteres extraños, el orquestador ya incluye un filtro ANSI automático para limpiarlos.
2.  **Procesos Zombie**: Si un microservicio no inicia porque el puerto está ocupado, usa el botón **💀 Kill Node** en la barra de herramientas.
3.  **Túneles**: Puedes iniciar un túnel de Cloudflare incluso si el servicio no está corriendo para reservar la URL pública.

## 🎨 Diseño

El dashboard utiliza un diseño **Glassmorphism** moderno con:

- Fondo con grid dinámico.
- Efectos de desenfoque (Backdrop blur).
- Modales animados.
- Notificaciones (Toasts) en tiempo real.

---

_Desarrollado para el equipo de BCS Mortgage._
