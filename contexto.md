# BioFold 3D — contexto maestro para continuar en una nueva sesión

Última actualización: 2 de septiembre de 2026. Este archivo describe el estado real del repositorio y las decisiones vigentes. El documento Word original de la hackathon es contexto de producto, no autoridad técnica.

## 1. Objetivo del producto

BioFold 3D es una SPA científica donde una persona y agentes WebMCP exploran la misma escena molecular. El producto diferencia de forma visible:

- **observed**: datos leídos de la estructura;
- **calculated**: geometría o estado derivados de forma determinista;
- **heuristic**: contexto cualitativo, especialmente mutaciones;
- **unavailable**: evidencia que no se pudo obtener.

No se deben prometer docking, ΔΔG, dinámica molecular, predicción de estabilidad, diagnóstico clínico ni mutación real de coordenadas.

## 2. Arquitectura vigente

```text
React/Vite UI ─┬─ AuthProvider ── Supabase Auth
               ├─ ProjectDataPort ── SupabaseProjectDataAdapter ── PostgreSQL/RLS
               ├─ Command Bus ── Zustand ── Activity Log
               │                    ├─ ViewerPort ── 3Dmol/WebGL
               │                    └─ GeometryPort ── Web Worker
               └─ AssistantClient ── biofold-chat Edge Function
                                      ├─ sesión + propiedad por RLS
                                      ├─ snapshot + historial
                                      ├─ RCSB/UniProt + caché 7 días
                                      ├─ pgvector + búsqueda textual/RRF
                                      └─ OpenRouter (secreto sólo servidor)
```

La UI y WebMCP ejecutan los mismos comandos. 3Dmol, workers, tokens y AbortSignals no se guardan en Zustand ni en snapshots. La landing carga de forma diferida el laboratorio, por lo que no inicia WebGL, workers ni WebMCP.

## 3. Estado de Git y servicios

- Repositorio: `https://github.com/JosueACondoriCh123/BioFold.git`.
- Rama de trabajo actual: `codex/phase2-assistant-core`.
- Commit base de esta fase: `eefcf2b`.
- Rama/base integrada anterior: `a35d704` (`fix: harden and integrate phase 2 contributions`).
- El usuario publica GitHub/Vercel; Codex no debe hacer push ni deploy sin una petición explícita.
- Proyecto Supabase real: Biofold, ref `wkrpwardtbeluwzutjyp`.
- `.env.local` contiene configuración pública real y está ignorado. No modificarlo, imprimirlo ni copiarlo a pruebas.
- Nunca poner `service_role`, `sb_secret_*`, secretos de Google u OpenRouter en `VITE_*`.

## 4. Fases realizadas

### MVP y plataforma — completado

- Viewer 3D con fixtures locales `1CRN`/`4HHB` y gateway RCSB.
- Representation, Spectrum, surface con loading/error/cancelación, distance y activity log.
- Ocho herramientas WebMCP auditadas, registradas sólo con sesión/ruta/viewer válidos.
- Landing, rutas públicas/privadas, login, signup, Google PKCE, confirmación, recuperación, cuenta y logout mediante Supabase Auth.
- Diseño oscuro suave, responsive y accesible.

### Fase 2.0/2.1 — completado en código

- `WorkspaceSnapshotV1`, persistencia optimista por revisión y restauración de cámara/escena/resultados.
- Proyectos privados, eventos, conversaciones, mensajes, consumo IA, metadata estructural y corpus vectorial.
- RLS por propietario, privilegios explícitos, índices de claves foráneas y actividad append-only.
- Lista/detalle/CRUD de proyectos, estados Saving/Saved/Offline/Conflict y pestañas Results/Assistant.

### Fase 2.2 — implementado en esta rama

El vertical slice ahora es:

1. abrir un proyecto guardado;
2. preguntar al Assistant;
3. verificar sesión y propiedad del proyecto;
4. recuperar snapshot, historial, RCSB/UniProt y corpus local;
5. llamar OpenRouter con structured output;
6. validar hasta tres propuestas contra los ocho contratos;
7. persistir pregunta, respuesta, citas y consumo;
8. mostrar SSE tipado;
9. ejecutar una propuesta sólo después de **Apply**;
10. guardar `Assistant · confirmed` en actividad;
11. restaurar conversación y estado Applied después de recargar.

Archivos principales de 2.2:

- `src/assistant/assistantClient.ts`: transporte SSE autenticado.
- `src/assistant/assistantService.ts`: composición producción/mock sin exponer proveedor.
- `src/assistant/assistantHistory.ts`: historial read-only bajo RLS.
- `src/types/assistant.ts`: contratos públicos.
- `src/features/assistant/ui/AssistantChat.tsx`: hidratación, cancelación y propuestas confirmadas.
- `supabase/functions/biofold-chat/index.ts`: autorización, RAG, persistencia, rate limit e idempotencia.
- `supabase/functions/_shared/assistantProtocol.ts`: validación estricta del servidor.
- `supabase/functions/_shared/openRouter.ts`: OpenRouter server-only con JSON Schema.
- `supabase/migrations/20260901225652_phase2_assistant_rag.sql`: request IDs, FTS, RRF y privilegios.
- `supabase/seed.sql`: cuatro chunks científicos BioFold con procedencia/checksum.

## 5. Contratos que no deben romperse

Las ocho acciones son:

1. `load_structure`
2. `get_structure_summary`
3. `focus_residues`
4. `set_representation`
5. `show_surface`
6. `measure_distance`
7. `preview_mutation_context`
8. `reset_workspace`

`COMMAND_NAMES` y `parseCommandInput` en `src/core/commandContracts.ts` son la autoridad cliente. La prueba `tests/assistantEdgeContracts.test.ts` obliga al catálogo del Edge a permanecer idéntico. Una propuesta nunca ejecuta el Command Bus automáticamente.

`CommandResult<T>` mantiene `ok`, `data/error`, `evidence`, `provenance` y `activityId`. `WorkspaceSnapshotV1` almacena sólo estado confirmado y serializable.

## 6. Seguridad de Assistant

- `supabase/config.toml` mantiene `verify_jwt = false` porque se usa una publishable key moderna; esto sólo es seguro mientras `biofold-chat` valide explícitamente el bearer mediante `auth.getUser(token)` y compruebe propiedad con un cliente user-scoped/RLS.
- El cliente service role se crea únicamente dentro de la Edge Function y sólo después de validar la sesión.
- `ai_requests` usa unicidad `(user_id, request_id)`; mensajes usan `(conversation_id, request_id, sender)` para replay sin duplicados.
- Límite actual: 6 solicitudes por usuario en una ventana de 60 segundos.
- Citas externas se construyen desde filas recuperadas o respuestas oficiales de RCSB/UniProt; el modelo no elige URLs.
- La búsqueda híbrida `hybrid_search_knowledge` es `SECURITY INVOKER` y ejecutable sólo por `service_role`.
- La función intenta embeddings nativos `gte-small` (384 dimensiones) y degrada a full-text si no están disponibles.
- OpenRouter se llama con `stream: false` para validar toda la respuesta estructurada antes de exponer propuestas. Después, el servidor divide la respuesta validada en eventos SSE. Es streaming de transporte, no token streaming del proveedor.

## 7. Configuración necesaria para activar 2.2

Frontend (Vercel, públicas):

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Edge Function (Supabase secrets, nunca Vercel/Vite):

```text
OPENROUTER_API_KEY
OPENROUTER_MODEL
OPENROUTER_SITE_URL
BIOFOLD_ALLOWED_ORIGINS
SUPABASE_PUBLISHABLE_KEY
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los ofrece el runtime hospedado de Supabase. El modelo de OpenRouter debe soportar structured outputs. Para local, copiar `supabase/functions/.env.example` a `supabase/functions/.env.local`, que está ignorado.

No se aplicaron migraciones, seeds, secretos ni funciones al Supabase real. Eso requiere autorización del usuario y primero debe probarse en una rama/entorno no productivo.

## 8. Evidencia de QA al cerrar esta sesión

- `pnpm lint`: aprobado.
- `pnpm typecheck`: aprobado.
- Suite unitaria final: **288/288** aprobadas.
- Checks focalizados de 2.2: **23/23** aprobados.
- `pnpm build`: aprobado; `dist/index.html` regenerado el 2 de septiembre de 2026.
- Suite Playwright completa antes del último ajuste de restauración: **53/53**, 0 flaky, 0 skipped.
- E2E focalizado posterior al último ajuste: **1/1**, cubre persistencia, citas, Apply y restauración de estado Applied.
- `pnpm supabase:test`: bloqueado, `ECONNREFUSED 127.0.0.1:54322`; Docker/Supabase local no estaba iniciado. Las pruebas estáticas SQL aprobaron, pero no sustituyen pgTAP real.

Warnings conocidos y aceptados por ahora:

- 3Dmol distribuye un bundle que usa `eval`; Vite lo advierte durante el build.
- El chunk del laboratorio supera 500 kB, pero permanece lazy y no contamina la landing pública.

## 9. Gate obligatorio antes de producción

1. Iniciar Docker Desktop (motor Linux).
2. Ejecutar `pnpm supabase:start`.
3. Ejecutar `pnpm supabase:reset` y `pnpm supabase:test` desde base vacía.
4. Verificar aislamiento usuario A/usuario B/anónimo y privilegio server-only del RPC.
5. Probar `biofold-chat` localmente con `pnpm supabase:functions` y un límite OpenRouter desechable.
6. Probar cancelación, replay del mismo `requestId`, 429 y modelo no disponible.
7. Aplicar migraciones primero a una rama Supabase no productiva.
8. Ejecutar Security Advisor y Performance Advisor.
9. Sólo con aprobación: migrar/seedear Biofold real, configurar secretos y desplegar `biofold-chat`.
10. Validar en la URL Vercel el flujo completo y las ocho site tools WebMCP.

## 10. Próxima fase sugerida (2.3)

- Ingestión reproducible que calcule embeddings del manifiesto en lugar de depender sólo de los chunks seed.
- Evaluación RAG con preguntas doradas, precisión de citas y pruebas de abstención.
- Conversaciones múltiples: crear, renombrar, cambiar y borrar con confirmación.
- Rate limiting atómico mediante RPC/contador transaccional si aumenta el tráfico.
- True provider streaming sólo si se diseña una forma segura de no exponer propuestas parciales sin validar.
- Mejor caché/observabilidad para RCSB y UniProt, con métricas de hit, latencia y fallo.
- Presupuesto por usuario/proyecto, sin mostrar ni persistir secretos.

## 11. Secuencia recomendada para una sesión nueva

1. Leer este archivo y `docs/PHASE2_DEVELOPMENT.md`.
2. Ejecutar `git status --short` y confirmar la rama `codex/phase2-assistant-core`.
3. No descartar cambios del usuario ni tocar `.env.local`.
4. Revisar el diff y ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
5. Si Docker está disponible, cerrar el gate SQL pendiente.
6. No desplegar ni aplicar cambios remotos sin autorización explícita.

Fuentes técnicas de referencia: documentación oficial de [Supabase Edge Functions](https://supabase.com/docs/guides/functions), [autorización en Edge Functions](https://supabase.com/docs/guides/functions/auth-headers), [hybrid search](https://supabase.com/docs/guides/ai/hybrid-search), [RCSB Data API](https://data.rcsb.org/), [UniProt REST API](https://www.uniprot.org/help/api) y [OpenRouter structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs).
