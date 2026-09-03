# BioFold 3D — configuración y aceptación de Supabase Auth

## Estado y límites

El frontend usa Supabase Auth; no requiere tablas de perfiles, backend propio ni cambios de esquema. El nombre se guarda en `user_metadata.full_name` **sólo para presentación**, nunca para autorizar acceso. Email es de consulta.

La configuración y los flujos reales del proyecto **Biofold** aún deben verificarse con su propietario. Tener el plugin instalado no implica que esta sesión tenga disponibles sus herramientas de proyecto. No se han creado usuarios, enviado correos, cambiado proveedores ni modificado configuración remota durante esta tarea.

## 1. Configuración pública local

Crea `.env.local` (ignorado por Git) en la raíz:

```dotenv
VITE_SUPABASE_URL=https://<PROJECT_REF>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<PUBLIC_KEY>
```

Usa la URL y la **Publishable key** del proyecto Biofold. La clave publishable y la legacy anon son formatos distintos; la legacy anon se admite sólo por compatibilidad. Nunca usar una secret key, `service_role`, secretos de Google ni OpenRouter en variables `VITE_*`: Vite las incluye en el código público. La validación del cliente rechaza claves secretas reconocibles, pero no sustituye revisar las variables antes del build.

Reinicia `pnpm dev` después de editar el entorno. El origen local del proyecto es **http://127.0.0.1:4173**. Usa exactamente ese origen durante todo el flujo PKCE; localhost, otra IP o puerto tienen almacenamiento diferente.

La ausencia de configuración válida muestra un estado explícito y mantiene cerrado el laboratorio. No existe login de desarrollo en el build de producción.

## 2. URLs, correo y Google

En Authentication → URL Configuration:

- Site URL: el origen público definitivo de BioFold (o http://127.0.0.1:4173 para un proyecto dedicado a desarrollo).
- Redirect URLs: permitir el callback de este proyecto, incluyendo su query de retorno:
  - `http://127.0.0.1:4173/auth/callback**`
  - `https://<TU-APP>.vercel.app/auth/callback**`
- Si necesitas previews, añade únicamente los orígenes concretos de tus previews. No permitir `https://*.vercel.app/**`.

El cliente envía todos los enlaces de registro, reenvío, recuperación y Google a `/auth/callback?next=…`. La allowlist interna admite sólo `/app`, `/app/account`, `/app/lab` y un PDB válido opcional. **/reset-password no se acepta como un next de usuario**: se devuelve únicamente después de verificar recuperación.

Para Google, configura el proveedor en Supabase con tu Client ID y Client Secret. La URI autorizada de Google es `https://<PROJECT_REF>.supabase.co/auth/v1/callback`, no la ruta del frontend. El cliente pide sólo `openid email profile`; no pide acceso offline a servicios de Google. Si la app OAuth está en testing, usa usuarios de prueba permitidos. Los secretos permanecen en Google/Supabase.

Para email, habilita el proveedor y confirma la política de verificación y contraseñas (mínimo de la UI: 8 caracteres; Supabase puede exigir más). Login no impone ese mínimo a contraseñas antiguas.

Configura SMTP propio para registro público. El servicio predeterminado tiene restricciones de destinatarios y envío y no garantiza entrega de producción. Los proyectos Free nuevos que usan el SMTP predeterminado pueden no permitir personalizar plantillas. No es necesario cambiar las plantillas para el flujo PKCE estándar; conserva `{{ .ConfirmationURL }}` y comprueba que respeta `redirect_to`.

Si el proyecto ya usa plantillas personalizadas con `token_hash`, el callback admite `type=email`, `signup` y `recovery` mediante `verifyOtp`. El servidor valida tipo y token juntos. No activar otros tipos sin ampliar explícitamente el alcance. Un ejemplo de enlace personalizado para recuperación es:

```html
<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

No publiques enlaces de recuperación completos en issues, capturas o registros. Los enlaces PKCE requieren abrirse en el navegador/origen que inició el flujo; cuando falta el verificador, se pide un enlace nuevo. Los antiguos callbacks implícitos con bearer tokens en el fragmento se limpian y **rechazan**, nunca se interpretan como recuperación validada.

## 3. Garantías implementadas

- `AuthProvider` expone el contrato estable `state/actions`. El controlador de sesión no accede al store molecular.
- Al arrancar, `getSession` obtiene una sesión candidata; `getUser(accessToken)` verifica su identidad con Auth. Una lectura final detecta cambio de sesión durante la consulta.
- `INITIAL_SESSION` no abre el workspace antes de esa comprobación.
- Un solo intercambio por arranque, incluso bajo StrictMode. `completeCallback` consume ese resultado; una sesión previa sin un callback válido no sirve como prueba.
- Recuperación PKCE procede del resultado `redirectType` del SDK instalado, no de `?type=recovery`. Para token_hash procede de una verificación OTP correcta.
- Los códigos, tokens, identificadores de flujo y errores se retiran de la URL antes de esperar la red, conservando el estado de React Router. Una respuesta tardía no reescribe la URL actual.
- Una sesión normal no permite utilizar la acción de recuperación. Tras actualizar contraseña, el permiso se consume y la pantalla vuelve al inicio con confirmación.
- Logout retira acceso y escena inmediatamente, invalida resultados anteriores y serializa la limpieza del SDK detrás de las operaciones pendientes. Así un login tardío no vuelve a persistir tokens tras un logout exitoso.
- Si el logout falla, el workspace sigue cerrado y Retry vuelve a intentar logout. No restaura la sesión almacenada como alternativa.
- Cambiar de usuario o desmontar invalida respuestas pendientes. Un evento tardío no reactiva una sesión cerrada; sí se permite un nuevo login explícito. Un login iniciado en otra pestaña después del logout local requiere recargar o iniciar sesión aquí.
- Se mantiene el último contrato científico y las ocho herramientas, sin introducir credenciales en actividad o comandos.

El SDK conserva la sesión de Auth; la escena molecular sigue siendo sólo de la pestaña. La protección de rutas no convierte el frontend ni los datos RCSB en recursos privados. Cualquier backend futuro deberá verificar identidad y autorización de nuevo.

## 4. Verificación automatizada y coordinación con QA

`pnpm test -- tests/auth` incluye adaptador, controlador, límites, páginas reales y SDK real con HTTP/almacenamiento simulados. No llama a Supabase real.

La suite E2E de plataforma usa un build **aislado** con `VITE_SUPABASE_URL=https://auth.biofold.test` y una clave ficticia de formato publishable. Intercepta todas sus solicitudes sin permitir salida a cuentas reales:

- `POST /auth/v1/signup`, `/token?grant_type=password`, `/token?grant_type=pkce`.
- `GET /auth/v1/user` para la comprobación real del usuario; `PUT /auth/v1/user` para nombre/contraseña.
- `POST /auth/v1/recover`, `/resend`, `/verify` y `/logout?scope=local`.
- Google: comprobar la URL de autorización sin visitar ni autorizar Google real.

Estado local al cierre de 2.3: las 323 pruebas Vitest y las 53 pruebas Playwright están aprobadas. El callback PKCE/recovery está cubierto bajo el replay de efectos de React StrictMode y reutiliza un único intercambio de código sin quedar bloqueado por un ticket de inicialización obsoleto.

No basta con insertar un token arbitrario en localStorage. Recuperación PKCE debe iniciar el flujo del SDK o preparar su verificador correctamente; `?type=recovery` no es autorización. `token_hash` requiere mock de verify exitoso. Mantener el caso sin configuración separado del build configurado y respetar la política CSP del entorno.

## 5. Aceptación real pendiente

### Estado observado en Biofold — 2026-09-01

- Proyecto `wkrpwardtbeluwzutjyp` identificado por el conector como **BioFold**, `ACTIVE_HEALTHY`.
- URL y publishable key locales aceptadas por `/auth/v1/settings` con HTTP 200.
- Registro por email habilitado; confirmación de email requerida (`mailer_autoconfirm: false`).
- Proveedor Google deshabilitado. Requiere Client ID/Secret en Google y Supabase antes de la aceptación OAuth.
- No se creó una cuenta real ni se envió correo durante la comprobación de configuración.

Con una cuenta de prueba autorizada, fuera del repositorio:

- [x] URL/clave pública correctas y CSP compatible con el origen Supabase.
- [ ] Callback local permitido en la configuración remota.
- [ ] Registro y entrega del correo; confirmación abre la ruta interna esperada.
- [ ] Reenvío, enlaces vencidos/usados y ausencia de verificador con errores accionables.
- [ ] Login email/contraseña y recarga de una ruta privada sin mostrar contenido antes de validar.
- [ ] Google: consentimiento de identidad y retorno correcto; rechazo del consentimiento comprensible.
- [ ] Recuperación: enlace nuevo → nueva contraseña → confirmación → login con nueva contraseña.
- [ ] Visitar reset-password con una sesión normal o un simple type=recovery no permite cambiar contraseña.
- [ ] Guardar nombre y comprobar persistencia tras recargar.
- [ ] Laboratorio → Account → laboratorio mantiene escena y cámara.
- [ ] Logout durante carga/superficie y recarga posterior sin tokens/escena anterior.
- [ ] Un segundo usuario no recibe escena ni actividad del primero.

No crear usuarios de evaluación ni cambiar configuración de producción sin autorización del propietario. Durante 2.3 no se modificó Auth remoto, SMTP, Google, redirects ni Vercel; publicación y aceptación con dos cuentas reales siguen a cargo del propietario.

## Referencias oficiales revisadas

- [Contraseñas y correo](https://supabase.com/docs/guides/auth/passwords)
- [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [getUser](https://supabase.com/docs/reference/javascript/auth-getuser)
- [Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Cambios en plantillas Free/SMTP, junio de 2026](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
