# BioFold 3D — aceptación de plataforma y Supabase Auth

## Estado verificable

La plataforma usa el `AuthProvider`, `SupabaseAuthAdapter` y `@supabase/supabase-js` reales. No existe un proveedor falso en `src/`, un login invitado ni un bypass para pruebas. El mock de QA termina en el límite HTTP de Supabase Auth y vive únicamente bajo `tests/`.

| Área | Evidencia automatizada | Evidencia real requerida |
| --- | --- | --- |
| Email/password | Signup, sesión no confirmada, login válido e inválido | Entrega del correo y login contra Biofold |
| Confirmación | PKCE S256, intercambio único, reenvío con nuevo verifier, enlaces vencidos | Apertura del correo real y callbacks permitidos |
| Recuperación | Solicitud neutral, PKCE, cambio efectivo, contraseña anterior rechazada y nueva aceptada | Entrega del email y política de contraseñas de Biofold |
| Google | URL, scopes mínimos, S256, callback y retorno interno simulados | Consentimiento Google y proveedor habilitado |
| Perfil | `updateUser`, persistencia tras recarga y error de servidor | Persistencia del nombre contra Biofold |
| Sesión | `getUser` remoto, logout local, expiración y rutas privadas | Caducidad y revocación contra Biofold |

Una prueba automatizada no certifica la entrega de SMTP, la configuración del proveedor Google ni la allowlist remota. Esas comprobaciones permanecen marcadas como manuales hasta ejecutarlas en el proyecto real.

## Aislamiento de QA

- El entorno normal no contiene valores ficticios en `.env`. Desarrollo toma únicamente `.env.local` con la URL y clave pública reales.
- `vite.platform-e2e.config.ts` usa `envDir: false`, `envPrefix: []` y constantes test-only de `tests/config/e2eEnvironment.ts`.
- La plataforma product-like se compila en `.qa_platform-build` y escucha en `4190`; el fixture del laboratorio usa `.qa_e2e-build`/`4191`; el caso sin configurar usa `.qa_unconfigured-build`/`4192`.
- Playwright intercepta cualquier ruta `/auth/v1/`. Si el bundle intenta contactar otro host, la petición se bloquea y la prueba falla. Nunca se crean usuarios ni se envían correos reales.
- El servidor simulado mantiene cuentas, contraseñas, códigos de un solo uso y tokens sólo durante cada prueba. Usa emails reservados `@example.test`.
- La aplicación en QA sigue iniciando el SDK instalado, persiste su sesión y ejecuta sus verificadores PKCE. Insertar un token arbitrario o `type=recovery` en la URL no concede permisos.
- Las pruebas unitarias reciben configuración vacía explícita y tampoco consumen el `.env.local` del desarrollador.

## Criterios cubiertos

- Landing sin canvas, worker molecular ni registro WebMCP.
- Retorno de `/app`, `/app/account` y `/app/lab?pdb=4HHB`; rechazo de destinos externos.
- Prevención de envíos duplicados y estados de error accionables.
- Confirmación inicial y reenvío PKCE; códigos vencidos, usados y sin verifier.
- Recuperación completa: solicitud → callback verificado → actualización → logout → rechazo de la contraseña anterior → aceptación de la nueva → recarga autenticada.
- Reset directo, sesión normal y fragmento implicit/forjado incapaces de actualizar contraseña.
- Google con scopes `openid email profile`, sin acceso offline y retorno al destino interno.
- Actualización del nombre persistente después de una nueva verificación `getUser`.
- Expiración y logout sin contenido privado, escena o herramientas tardías.
- Laboratorio con ocho herramientas sólo en su ruta; resultados y canvas conservados al ir a Account y volver.
- Configuración ausente explícita, sin acceso invitado.

## Ejecución reproducible

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test:e2e:platform` ejecuta solamente la plataforma real con el SDK y el caso sin configuración. `pnpm test:e2e:lab` ejecuta la regresión científica. Los tres servidores de QA son construidos por Playwright y no dependen de `dist/`, del servidor de desarrollo ni de un `.env` compartido.

Consultar [AUTH_SETUP.md](AUTH_SETUP.md) para conectar Biofold, callbacks locales/Vercel, Google y SMTP. Registrar la aceptación real allí sólo después de observar el flujo completo.
