/**
 * Mensajes del bot CIO
 */

// CONFIGURACIÓN DE LINKS
const WOMPI_CHECKOUT_LINK = process.env.WOMPI_CHECKOUT_LINK || 'https://checkout.wompi.co/l/xTJSuZ';
const WOMPI_CHECKOUT_LINK_PRO = process.env.WOMPI_CHECKOUT_LINK_PRO || 'https://checkout.wompi.co/l/3XLQMl';
const LANDING_URL = 'https://cio.almia.com.co';
const TERMS_URL = `${LANDING_URL}/terms-of-service`;
const PRIVACY_URL = `${LANDING_URL}/privacy-policy`;

export const BotMessages = {
  // BIENVENIDA Y NOMBRE

  // Bienvenida (usada internamente, ya no se muestra sola)
  WELCOME: `\u00A1Hola! \u{1F44B} Soy *CIO, tu Cazador Inteligente de Ofertas* by ALMIA.

Est\u00E1s usando la *versi\u00F3n Free*: Estoy aqu\u00ED para ayudarte a encontrar las *mejores ofertas de empleo en Latam*, de forma r\u00E1pida y personalizada. Conmigo podr\u00E1s:

\u{1F4CD} Buscar empleos ajustados a tu perfil
\u{1F514} Recibir alertas diarias seg\u00FAn tus intereses
\u2728 Ajustar filtros por ubicaci\u00F3n, salario y tipo de empleo`,

  // Usuario no registrado - registro in-bot
  NOT_REGISTERED: `\u{1F44B} \u00A1Hola! Bienvenido a *CIO*, tu Cazador Inteligente de Ofertas de Almia.

Para comenzar, necesito registrarte. Es *gratis* y solo toma unos segundos.

\u270F\uFE0F \u00BFCu\u00E1l es tu *nombre completo*?`,

  // Pedir email durante registro in-bot
  WA_ASK_EMAIL: (name: string) => `\u00A1Perfecto, *${name}*! \u{1F44B}

Ahora necesito tu *correo electr\u00F3nico* para completar el registro.

\u270F\uFE0F Escr\u00EDbelo a continuaci\u00F3n:`,

  // Registro completado
  WA_REGISTRATION_COMPLETE: (name: string) => `\u2705 \u00A1Registro exitoso, *${name}*!

Tu cuenta ha sido creada con el *Plan Free*:
\u{1F50D} 5 b\u00FAsquedas por una semana

\u00A1Vamos a configurar tu perfil para encontrar las mejores ofertas!`,

  // Bienvenida para usuario registrado (primera vez en el chat)
  WELCOME_REGISTERED: (name: string) => `\u00A1Hola *${name}*! \u{1F44B} Bienvenido a CIO, tu Cazador Inteligente de Ofertas de Almia.

Con CIO ver\u00E1s oportunidades de empleo relevantes en Latam de manera *r\u00E1pida y pr\u00E1ctica*. 

\u{1F4CB} Tu versi\u00F3n Free incluye: 

\u{1F4C5} 1 semana cazando las mejores ofertas

\u{1F514} Alertas de empleo diarias

\u{1F3AF} B\u00FAsqueda personalizada seg\u00FAn tus preferencias

Yo me encargo de buscar oportunidades alineadas a tu perfil, para que t\u00FA inviertas tu energ\u00EDa en aplicar mejor \u2728`,

  // Mensaje cuando completa el onboarding
  ONBOARDING_COMPLETE: (name: string) => `\u00A1Perfecto, *${name}*! \u2705 Tu perfil est\u00E1 listo.

\u{1F3AF} *\u00A1Ya puedes empezar a buscar ofertas!*

Escribe *"buscar"* cuando est\u00E9s listo y te mostrar\u00E9 las mejores ofertas que encontr\u00E9 para ti.

\u{1F4CB} *Otros comandos disponibles:*
\u270F\uFE0F *editar* - Cambiar tus preferencias
\u{1F504} *reiniciar* - Reconfigurar tu perfil
\u274C *cancelar* - Dejar de usar el servicio`,

  // [ELIMINADO] DISPOSITIVO - Ya no se pregunta, asumimos celular
  // ASK_DEVICE: (eliminado - todos los usuarios se tratan como móvil)

  // Términos y condiciones
  ASK_TERMS: `Selecciona "Acepto" para continuar \u2705

T\u00E9rminos y Privacidad: ${TERMS_URL}`,

  // Rechazo de términos
  TERMS_REJECTED: `Entiendo. Si cambias de opini\u00F3n, puedes escribirme de nuevo cuando quieras. \u00A1\u00C9xito en tu b\u00FAsqueda de empleo! \u{1F44B}`,

  // Preguntas del onboarding
  V2_WELCOME_ROLE: `Hola, soy CIO, tu cazador inteligente de ofertas.

Te ayudo a encontrar empleo m\u00E1s r\u00E1pido.

\u00BFQu\u00E9 cargo o rol est\u00E1s buscando?`,
  V2_ASK_LOCATION: `\u00BFD\u00F3nde te gustar\u00EDa trabajar?

Puedes escribir una ciudad, un pa\u00EDs o "remoto".`,
  V2_ASK_EXPERIENCE: `\u00BFCu\u00E1nta experiencia tienes en este rol?

Elige una opci\u00F3n \u{1F447}`,
  PREMIUM_ASK_CV: `Antes de continuar con tu onboarding premium, dime:

\u00BFTienes hoja de vida para leerla y configurar tu perfil m\u00E1s r\u00E1pido?`,
  PREMIUM_WAITING_CV_FILE: `Perfecto. Env\u00EDa tu hoja de vida en PDF, Word o foto.

Cuando la reciba, extraigo rol, experiencia y ubicaci\u00F3n.`,
  PREMIUM_PROCESSING_CV: `Recib\u00ED tu hoja de vida.

Estoy proces\u00E1ndola para extraer tus preferencias.`,
  PREMIUM_CONFIRM_CV_PROFILE: (
    role: string,
    experience: string,
    location: string,
    missingLabels: string[],
  ) => {
    const missingText = missingLabels.length
      ? `\n\nNo pude extraer: ${missingLabels.join(', ')}.`
      : '';

    return `Esto fue lo que detect\u00E9 de tu hoja de vida:

Rol: ${role}
Experiencia: ${experience}
Ubicaci\u00F3n: ${location}${missingText}

\u00BFConfirmas que seguimos con esta informaci\u00F3n?`;
  },
  PREMIUM_CV_MISSING_ROLE: `De tu hoja de vida no pude extraer el rol.

Por favor, escribe el cargo o rol que buscas.`,
  PREMIUM_CV_MISSING_LOCATION: `De tu hoja de vida no pude extraer la ubicaci\u00F3n.

Escribe una ciudad, un pa\u00EDs o "remoto".`,
  PREMIUM_CV_MISSING_EXPERIENCE: `De tu hoja de vida no pude extraer la experiencia.

Selecciona tu nivel para continuar.`,
  PREMIUM_NO_CV_ASK_ROLE: `Perfecto, lo hacemos sin hoja de vida.

Dime el cargo o rol que buscas para iniciar tu diagn\u00F3stico premium.`,
  PREMIUM_DIAGNOSIS_READY: `Listo. Con esto inicio tu diagn\u00F3stico premium y te comparto una oferta.`,
  V2_REGISTER_NAME: `Listo. Para seguir envi\u00E1ndote ofertas, vamos a registrarte en CIO.

Tendr\u00E1s una prueba gratuita de 7 d\u00EDas.

Primero, \u00BFcu\u00E1l es tu nombre?`,
  V2_REGISTER_EMAIL: (name: string) => `Gracias, ${name}.

Ahora, \u00BFcu\u00E1l es tu correo?`,
  V2_TERMS_CONSENT: `Gracias por compartir tu nombre y correo.

Al hacerlo, autorizas el tratamiento de tus datos seg\u00FAn nuestra pol\u00EDtica de privacidad.
Puedes revisarla aqu\u00ED: ${TERMS_URL}

Ahora s\u00ED, continuemos con tu b\u00FAsqueda.`,
  V2_TERMS_REJECTED: `Para continuar con tu registro y activar tu prueba, necesito que aceptes los t\u00E9rminos.`,
  V2_REJECTION_REASON: `Gracias, eso me ayuda a ajustar mejor la b\u00FAsqueda.

\u00BFPor qu\u00E9 no te interes\u00F3?`,

  V2_TRIAL_ACTIVATED: `Ya activ\u00E9 tu versi\u00F3n free por 7 d\u00EDas.

Durante esta semana te enviaremos ofertas seg\u00FAn tu b\u00FAsqueda.

No tienes que entrar a los portales, nosotros las buscamos por ti.`,

  ASK_ROLE: `\u00A1Genial! \u{1F3AF}

*\u00BFCu\u00E1l es el cargo o profesi\u00F3n PRINCIPAL en el que est\u00E1s buscando empleo?*

\u26A0\uFE0F Escribe solo UNO para que la b\u00FAsqueda sea m\u00E1s acertada.

*Ejemplos:* Asesor Comercial - Marketing - Analista de datos - Auxiliar Administrativo - Ingeniero Industrial - Desarrollador de software`,

  ASK_EXPERIENCE: `\u00A1Perfecto! Ahora dime tu nivel de experiencia en este rol: 
Elige una opci\u00F3n \u{1F447}`,

  ASK_LOCATION: `Excelente. Ahora dime:

\u00BFEn qu\u00E9 ciudad est\u00E1s buscando empleo?

\u26A0\uFE0F *Escribe solo UNA ubicaci\u00F3n* (ciudad o pa\u00EDs)

Ejemplo: "Bogot\u00E1", "Lima", "Colombia", "Argentina", etc.`,

  // [DESACTIVADO] Pregunta de modalidad de trabajo (remoto/presencial/híbrido)
  // Puede reactivarse en el futuro si se requiere
  // ASK_WORK_MODE: `Perfecto. ¿Qué modalidad de trabajo prefieres?
  //
  // 🏠 *Remoto* - Trabajar desde casa
  // 🏢 *Presencial* - Ir a la oficina
  // 🔀 *Híbrido* - Mixto (remoto + presencial)
  // ✅ *Sin preferencia* - Cualquier modalidad
  //
  // Selecciona una opción.`,

  // [DESACTIVADO] Pregunta de tipo de jornada - No aporta valor significativo
  // ASK_JOB_TYPE: `¿Qué tipo de jornada prefieres?
  //
  // 1️⃣ Tiempo completo
  // 2️⃣ Medio tiempo
  // 3️⃣ Pasantía
  // 4️⃣ Freelance
  //
  // Responde con el número o el nombre.`,

  // [DESACTIVADO] Pregunta de salario - No aporta valor significativo
  // ASK_MIN_SALARY: `¿Cuál es tu salario ideal? (en pesos colombianos)
  //
  // _(Esto nos ayuda a priorizar ofertas que coincidan con tus expectativas)_
  //
  // Ejemplo: "2000000", "2.5 millones", etc.
  //
  // _Si no tienes una preferencia específica, escribe "0"_`,

  // [DESACTIVADO] ASK_ALERT_FREQUENCY - Frecuencia siempre es diaria
  ASK_ALERT_FREQUENCY: '', // Mantenido por compatibilidad pero no se usa

  ASK_ALERT_TIME: `Perfecto. \u23F0

\u00BFA qu\u00E9 hora quieres recibir las alertas?

Ejemplo: "9:00", "18:30", "10:00 AM", etc.`,

  ASK_ALERT_TIME_MOBILE: `Perfecto. \u23F0

Selecciona la hora en que quieres recibir las alertas:

_Si prefieres otra hora, escr\u00EDbela (ej: "20:00", "7:30 AM")_`,

  // Errores de validación
  ERROR_ROLE_INVALID: `Parece que no has especificado un rol para tu b\u00FAsqueda.

Escr\u00EDbeme el nombre del cargo o una palabra clave para mostrarte ofertas.

Ejemplo: "Vendedor", "Marketing", "Analista", "Dise\u00F1ador".`,

  ERROR_EXPERIENCE_INVALID: `Selecciona tu nivel de experiencia:

- Sin experiencia
- Junior (1-2 a\u00F1os)
- Intermedio (3-5 a\u00F1os)
- Senior (5+ a\u00F1os)
- Lead/Expert (7+ a\u00F1os)`,

  ERROR_LOCATION_INVALID: `Por favor, ingresa una ciudad o pa\u00EDs v\u00E1lido.

Ejemplo: "Bogot\u00E1", "Lima", "M\u00E9xico", "Colombia", "Per\u00FA", etc.`,

  ERROR_LOCATION_REMOTE_INVALID: `Entiendo que quieres trabajo remoto. \u{1F30E}

En esta pregunta debes escribir *una ubicaci\u00F3n v\u00E1lida* (ciudad o pa\u00EDs) para continuar.

Ejemplo: "Bogot\u00E1", "Colombia", "Lima".

Por favor vuelve a ingresar tu ubicaci\u00F3n.`,

  ERROR_LOCATION_TOO_VAGUE: `Esa ubicaci\u00F3n es muy amplia para buscar ofertas. \u{1F30E}

Por favor escribe una *ciudad* o *pa\u00EDs* espec\u00EDfico.

Ejemplo: "Colombia", "M\u00E9xico", "Bogot\u00E1", "Lima", etc.`,

  // [DESACTIVADO] ASK_ALERT_FREQUENCY - Frecuencia siempre es diaria
  ERROR_ALERT_FREQUENCY_INVALID: '', // Mantenido por compatibilidad pero no se usa

  ERROR_TIME_INVALID: `Por favor ingresa una hora v\u00E1lida.

Ejemplo: "9:00", "18:30", "10:00 AM"`,

  // Mensajes de ayuda
  HELP_MESSAGE: `*\u00BFC\u00F3mo puedo ayudarte?*

Por ahora estoy en fase de pruebas. Pronto podr\u00E1s:

\u{1F4DD} Escribir "buscar" para ver ofertas de empleo
\u{1F4CB} Enviar tu CV para personalizar las b\u00FAsquedas
\u2699\uFE0F Cambiar tus preferencias de b\u00FAsqueda

\u00BFNecesitas algo m\u00E1s?`,

  // Mensaje cuando no se entiende
  UNKNOWN_INTENT: `No entend\u00ED tu mensaje. \u{1F605}`,

  // Mensaje cuando el usuario está en estado READY (usado con returnToMainMenu que añade menú)
  NOT_READY_YET: `\u00A1Tu perfil est\u00E1 listo! \u{1F389}`,

  // Mensaje de error general
  ERROR_GENERAL: `Lo siento, ocurri\u00F3 un error inesperado. \u{1F614}

Por favor intenta de nuevo en unos momentos.`,

  // Mensaje de retry cuando falla envío
  ERROR_RETRY: `_Hubo un problema enviando el mensaje anterior. Por favor responde directamente escribiendo tu respuesta._`,

  // Mensajes de gestión de cuenta
  CONFIRM_RESTART: `\u00BFEst\u00E1s seguro que deseas reiniciar tu perfil? \u{1F504}

Esto eliminar\u00E1 toda tu configuraci\u00F3n actual y comenzar\u00E1s desde cero.`,

  RESTART_CANCELLED: `Perfecto, tu perfil se mantiene como est\u00E1. \u{1F44D}`,

  RESTARTED: `Tu perfil ha sido reiniciado. Comencemos de nuevo. \u{1F504}`,

  CONFIRM_CANCEL_SERVICE: `\u00BFEst\u00E1s seguro que deseas dejar de usar CIO? \u{1F622}

Esto eliminar\u00E1 toda tu informaci\u00F3n y no recibir\u00E1s m\u00E1s alertas.`,

  SERVICE_CANCELLED: `Listo \u2705 

Tus preferencias se han eliminado y ya no recibir\u00E1s alertas. Tu cuenta sigue activa, as\u00ED que puedes volver cuando quieras. 

\u{1F4A1} _Tip Almia: Aprovecha este tiempo para reforzar tu CV y LinkedIn; peque\u00F1as mejoras hoy pueden abrir grandes oportunidades ma\u00F1ana._`,

  CANCEL_SERVICE_ABORTED: `\u00A1Me alegra que te quedes! \u{1F60A} Tu perfil sigue activo.`,

  // Mensajes de edición de perfil (ya no se usa, se genera dinámicamente en showProfileForEditing)
  SHOW_CURRENT_PREFERENCES: (profile: {
    role: string;
    location: string;
    alertTime: string;
  }) => `\u{1F4CB} *Tus preferencias actuales:*

\u{1F4BC} *Rol:* ${profile.role}
\u{1F4CD} *Ubicaci\u00F3n:* ${profile.location}
\u23F0 *Horario de alertas:* ${profile.alertTime}

Selecciona qu\u00E9 quieres editar en la lista.

\u{1F4A1} _Tips r\u00E1pidos_

\u{1F4CD} Ubicaci\u00F3n: si est\u00E1s abierto/a, escribe solo el pa\u00EDs (ej: Colombia).
Si quieres remoto, igual escribe una ciudad o pa\u00EDs base (ej: Bogot\u00E1 o Colombia).

\u{1F3AF} Cargo: si no hay resultados, prueba con \u00E1reas (Tecnolog\u00EDa, Ventas, Marketing) o habilidades (Power BI, IA, Excel).`,

  EDIT_FIELD_NOT_FOUND: `No entend\u00ED qu\u00E9 campo quieres editar. \u{1F605}

Por favor, selecciona una opci\u00F3n de la lista.`,

  FIELD_UPDATED: (
    fieldName: string,
    newValue: string,
    name?: string | null,
  ) => `\u2705 Perfecto${name ? ` ${name}` : ''}! Tu *${fieldName}* ha sido actualizado a: *${newValue}*

Tu perfil est\u00E1 listo. Puedes:
\u2022 Escribir *"buscar"* para encontrar ofertas ahora
\u2022 Escribir *"editar"* para cambiar otra preferencia
\u2022 Escribir *"reiniciar"* para volver a configurar todo desde cero`,

  // Menú de comandos en estado READY
  MENU_READY: `\u00BFQu\u00E9 te gustar\u00EDa hacer?

\u{1F4CB} *Comandos disponibles:*

\u{1F50D} *buscar* - Buscar ofertas de empleo ahora
\u270F\uFE0F *editar* - Cambiar tus preferencias
\u{1F504} *reiniciar* - Reconfigurar tu perfil desde cero
\u274C *cancelar* - Dejar de usar el servicio

Escribe el comando que desees.`,

  // Ofrecer alertas durante onboarding (antes de primera búsqueda)
  OFFER_ALERTS: `\u00A1Ya casi terminamos! \u{1F3AF}

\u00BFQuieres que te env\u00EDe alertas autom\u00E1ticas diarias de empleo? \u{1F514}

\u2728 *Beneficios:*
\u2022 No tienes que estar buscando
\u2022 Recibes ofertas actualizadas diarias seg\u00FAn tu perfil
\u2022 T\u00FA eliges la hora de env\u00EDo

\u{1F447} Elige una opci\u00F3n:`,

  // Confirmación de rechazo de alertas
  ALERTS_DISABLED: `Perfecto, *no activar\u00E9 las alertas autom\u00E1ticas*. \u2705

\u{1F3AF} *\u00A1Tu perfil est\u00E1 listo!*

Ya puedes empezar a buscar ofertas de empleo personalizadas.

_(Si cambias de opini\u00F3n m\u00E1s adelante, puedes activar las alertas desde el men\u00FA de *"editar"*)_`,

  // ==========================================
  // MENSAJES DE SISTEMA DE PLANES
  // ==========================================

  // Freemium agotado (primera vez)
  FREEMIUM_EXPIRED: `\u{1F6A8} *Se acabaron tus b\u00FAsquedas del Plan Free*

No frenes tu b\u00FAsqueda ahora \u{1F4BC}
Con CIO sigues recibiendo ofertas reales y alineadas a tu perfil, sin perder tiempo.

*Elige tu plan:*

\u2B50 *CIO Premium \u2014 $20.000 COP / 30 d\u00EDas*
\u{1F517} Activa aqu\u00ED: ${WOMPI_CHECKOUT_LINK}

\u{1F3C6} *CIO Pro \u2014 $54.000 COP / 90 d\u00EDas* _(Mejor valor)_
\u{1F517} Activa aqu\u00ED: ${WOMPI_CHECKOUT_LINK_PRO}

*Ambos planes incluyen:*
\u{1F50D} Cazar ofertas durante todo tu plan
\u2705 Mayor cantidad de ofertas por b\u00FAsqueda
\u{1F514} Alertas diarias por WhatsApp
\u{1F3AF} B\u00FAsqueda personalizada seg\u00FAn tu cargo
\u{1F64B} Soporte de un mentor Almia

Despu\u00E9s del pago, escr\u00EDbenos el correo con el que pagaste y activamos tu acceso de inmediato \u{1F447}

\u{1F4F1} \u00BFTienes dudas? Escr\u00EDbenos +57 3332393280 y te ayudamos.`,

  // Plan pagado expirado (Premium o Pro)
  PREMIUM_EXPIRED: `*\u{1F6A8} Tu Plan ha finalizado*

\u{1F4AA} *No frenes tu b\u00FAsqueda ahora.*

Para continuar disfrutando de los beneficios de CIO, renueva tu suscripci\u00F3n:

*Elige tu plan:*

\u2B50 *CIO Premium* \u2014 $20.000 COP / 30 d\u00EDas
\u{1F517} ${WOMPI_CHECKOUT_LINK}

\u{1F3C6} *CIO Pro* \u2014 $54.000 COP / 90 d\u00EDas _(Mejor valor)_
\u{1F517} ${WOMPI_CHECKOUT_LINK_PRO}

Despu\u00E9s del pago, escr\u00EDbenos el *correo con el que pagaste* y activamos tu acceso autom\u00E1ticamente.

\u{1F4F1} \u00BFDudas? Escr\u00EDbenos por WhatsApp: *+57 333 239 3280*`,

  // Freemium agotado (usuario que vuelve después de cancelar)
  FREEMIUM_EXPIRED_RETURNING_USER: (name?: string | null) => `\u00A1Hola${name ? ` ${name}` : ''}! \u{1F44B}

Veo que ya agotaste tu per\u00EDodo de prueba gratuita.

Para continuar usando CIO, elige tu plan:

\u2B50 *CIO Premium* \u2014 $20.000 COP / 30 d\u00EDas
\u{1F517} ${WOMPI_CHECKOUT_LINK}

\u{1F3C6} *CIO Pro* \u2014 $54.000 COP / 90 d\u00EDas _(Mejor valor)_
\u{1F517} ${WOMPI_CHECKOUT_LINK_PRO}

Una vez realices el pago, ingresa el *correo electr\u00F3nico* que usaste para pagar.`,

  // Recordatorio de freemium expirado (23 horas después)
  FREEMIUM_REMINDER: (name?: string | null) => `Hola${name ? ` ${name}` : ''} \u{1F44B}

Veo que a\u00FAn no has activado un plan.

Recuerda: _las oportunidades no llegan solas, hay que salir a cazarlas con foco._

Yo busco y filtro ofertas seg\u00FAn tu perfil y te las env\u00EDo directo a WhatsApp, para ahorrarte tiempo y ruido.

*Elige tu plan:*

\u2B50 *CIO Premium*  \u2014  $20.000 COP / 30 d\u00EDas
\u{1F517} ${WOMPI_CHECKOUT_LINK}

\u{1F3C6} *CIO Pro*  \u2014  $54.000 COP / 90 d\u00EDas _(Mejor valor)_
\u{1F517} ${WOMPI_CHECKOUT_LINK_PRO}

Mira c\u00F3mo funciona:
\u{1F4F1} https://www.instagram.com/p/DTghZbMDS3O/

Si tienes dudas, puedes hablar con un humano aqu\u00ED:
\u{1F4DE} +57 333 239 3280`,

  // Pedir email para vincular pago
  FREEMIUM_EXPIRED_ASK_EMAIL: `Para verificar tu pago, ingresa el *correo electr\u00F3nico* que usaste al momento de realizar el pago:`,

  // Email registrado, mostrar enlace de pago
  PAYMENT_LINK: (email: string) => `\u2705 Hemos registrado tu correo: *${email}*

\u{1F517} *Realiza tu pago aqu\u00ED:* ${WOMPI_CHECKOUT_LINK}

\u26A0\uFE0F *Importante:* Usa el mismo correo (*${email}*) al momento de pagar para que podamos vincular tu cuenta autom\u00E1ticamente.

Una vez realizado el pago, escribe *"verificar"* y confirmaremos tu suscripci\u00F3n.`,

  // Pago no encontrado
  PAYMENT_NOT_FOUND: `\u274C No encontramos un pago asociado a tu correo electr\u00F3nico.

Verifica que:
1. Hayas completado el pago exitosamente
2. El correo que ingresaste sea el mismo que usaste para pagar

Si el problema persiste, escribe otro correo o contacta soporte.

\u{1F517} *Enlace de pago:* ${WOMPI_CHECKOUT_LINK}`,

  // Pago confirmado exitosamente
  PAYMENT_CONFIRMED: (name?: string | null) => `\u{1F389} *\u00A1Felicidades${name ? ` ${name}` : ''}!*

Tu pago ha sido *confirmado exitosamente*.

\u2705 Ya tienes acceso al *Plan Premium* por 30 d\u00EDas:
\u2022 5 b\u00FAsquedas semanales (20 al mes)
\u2022 Alertas personalizadas de empleo
\u2022 Soporte prioritario

\u{1F4A1} _Tip Almia: Aplicar a vacantes buenas es mejor que aplicar masivamente._

\u00BFQu\u00E9 te gustar\u00EDa hacer?
\u2022 Escribe *"buscar"* para encontrar ofertas ahora`,

  // Ayuda mientras espera pago
  WAITING_PAYMENT_HELP: `\u{1F4AC} *\u00BFNecesitas ayuda?*

Tambi\u00E9n puedes escribir tu *correo electr\u00F3nico* si quieres cambiarlo o corregirlo.

\u{1F517} *Enlace de pago:* ${WOMPI_CHECKOUT_LINK}`,

  // Límite semanal de premium alcanzado
  PREMIUM_WEEKLY_LIMIT_REACHED: (resetDate: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    };
    const formattedDate = resetDate.toLocaleDateString('es-CO', options);

    return `\u23F0 *Has alcanzado tu l\u00EDmite de 5 b\u00FAsquedas esta semana.*

Recuerda que tu plan incluye *20 b\u00FAsquedas al mes* (5 por semana).

\u{1F4C5} *Tus b\u00FAsquedas se renovar\u00E1n el ${formattedDate}*

\u{1F4A1} _Aplicar a vacantes buenas es mejor que aplicar masivamente._

Mientras tanto, puedes:
\u2022 Revisar las ofertas que ya te enviamos
\u2022 Editar tu perfil con *"editar"* para mejores resultados`;
  },

  // Email inválido
  ERROR_EMAIL_INVALID: `Por favor, ingresa un correo electr\u00F3nico v\u00E1lido.

Ejemplo: tu.correo@ejemplo.com`,

  // Bienvenida para usuario premium que vuelve
  WELCOME_BACK_PREMIUM: (name?: string | null) => `\u00A1Hola de nuevo${name ? `, ${name}` : ''}! \u{1F44B}

Veo que tienes el *Plan Premium* activo. \u00A1Continuemos!`,

  // Info de usos restantes (mostrar después de búsqueda)
  USES_REMAINING_FREEMIUM: (usesLeft: number) => `

\u{1F4A1} _Te quedan *${usesLeft}* b\u00FAsqueda${usesLeft !== 1 ? 's' : ''} gratuita${usesLeft !== 1 ? 's' : ''}._`,

  USES_REMAINING_PREMIUM: (usesLeft: number) => `

\u{1F4A1} _Te quedan *${usesLeft}* b\u00FAsqueda${usesLeft !== 1 ? 's' : ''} esta semana._`,
};
