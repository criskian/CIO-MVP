/**
 * Mensajes del bot CIO
 */

// CONFIGURACIÃ“N DE LINKS
const WOMPI_CHECKOUT_LINK = process.env.WOMPI_CHECKOUT_LINK || 'https://checkout.wompi.co/l/xTJSuZ';
const WOMPI_CHECKOUT_LINK_PRO = process.env.WOMPI_CHECKOUT_LINK_PRO || 'https://checkout.wompi.co/l/3XLQMl';
const LANDING_URL = 'https://cio.almia.com.co';
const TERMS_URL = `${LANDING_URL}/terms-of-service`;
const PRIVACY_URL = `${LANDING_URL}/privacy-policy`;

export const BotMessages = {
  // BIENVENIDA Y NOMBRE

  // Bienvenida (usada internamente, ya no se muestra sola)
  WELCOME: `Â¡Hola! ðŸ‘‹ Soy *CIO, tu Cazador Inteligente de Ofertas* by ALMIA.

EstÃ¡s usando la *versiÃ³n Free*: Estoy aquÃ­ para ayudarte a encontrar las *mejores ofertas de empleo en Latam*, de forma rÃ¡pida y personalizada. Conmigo podrÃ¡s:

âœ¨ Buscar empleos ajustados a tu perfil
âœ¨ Recibir alertas diarias segÃºn tus intereses
âœ¨ Ajustar filtros por ubicaciÃ³n, salario y tipo de empleo`,

  // Usuario no registrado - registro in-bot
  NOT_REGISTERED: `ðŸ‘‹ Â¡Hola! Bienvenido a *CIO*, tu Cazador Inteligente de Ofertas de Almia.

Para comenzar, necesito registrarte. Es *gratis* y solo toma unos segundos.

ðŸ“ Â¿CuÃ¡l es tu *nombre completo*?`,

  // Pedir email durante registro in-bot
  WA_ASK_EMAIL: (name: string) => `Â¡Perfecto, *${name}*! ðŸ‘‹

Ahora necesito tu *correo electrÃ³nico* para completar el registro.

ðŸ“§ EscrÃ­belo a continuaciÃ³n:`,

  // Registro completado
  WA_REGISTRATION_COMPLETE: (name: string) => `âœ… Â¡Registro exitoso, *${name}*!

Tu cuenta ha sido creada con el *Plan Free*:
ðŸ” 5 bÃºsquedas por una semana

Â¡Vamos a configurar tu perfil para encontrar las mejores ofertas!`,

  // Bienvenida para usuario registrado (primera vez en el chat)
  WELCOME_REGISTERED: (name: string) => `Â¡Hola *${name}*! ðŸ‘‹ Bienvenido a CIO, tu Cazador Inteligente de Ofertas de Almia.

Con CIO verÃ¡s oportunidades de empleo relevantes en Latam de manera *rÃ¡pida y prÃ¡ctica*. 

ðŸ’¼ Tu versiÃ³n Free incluye: 

ðŸ—“ï¸ 1 semana cazando las mejores ofertas

ðŸ”” Alertas de empleo diarias

ðŸŽ¯ BÃºsqueda personalizada segÃºn tus preferencias

Yo me encargo de buscar oportunidades alineadas a tu perfil, para que tÃº inviertas tu energÃ­a en aplicar mejor âœ¨`,

  // Mensaje cuando completa el onboarding
  ONBOARDING_COMPLETE: (name: string) => `Â¡Perfecto, *${name}*! âœ… Tu perfil estÃ¡ listo.

ðŸŽ¯ *Ya puedes empezar a buscar ofertas!*

Escribe *"buscar"* cuando estÃ©s listo y te mostrarÃ© las mejores ofertas que encontrÃ© para ti.

ðŸ“‹ *Otros comandos disponibles:*
âœï¸ *editar* - Cambiar tus preferencias
ðŸ”„ *reiniciar* - Reconfigurar tu perfil
âŒ *cancelar* - Dejar de usar el servicio`,

  // [ELIMINADO] DISPOSITIVO - Ya no se pregunta, asumimos celular
  // ASK_DEVICE: (eliminado - todos los usuarios se tratan como mÃ³vil)

  // TÃ©rminos y condiciones
  ASK_TERMS: `Selecciona "Acepto" para continuar \u2705

Términos y Privacidad: ${TERMS_URL}`,

  // Rechazo de tÃ©rminos
  TERMS_REJECTED: `Entiendo. Si cambias de opiniÃ³n, puedes escribirme de nuevo cuando quieras. Â¡Ã‰xito en tu bÃºsqueda de empleo! ðŸ‘‹`,

  // Preguntas del onboarding
  V2_WELCOME_ROLE: `Hola, soy CIO, tu cazador inteligente de ofertas.

Te ayudo a encontrar empleo más rápido.

¿Qué cargo o rol estás buscando?`,
  V2_ASK_LOCATION: `¿Dónde te gustaría trabajar?

Puedes escribir una ciudad, un país o "remoto".`,
  V2_ASK_EXPERIENCE: `¿Cuánta experiencia tienes en este rol?

Elige una opción 👇`,
  V2_REGISTER_NAME: `Listo. Para seguir enviándote ofertas, vamos a registrarte en CIO.

Tendrás una prueba gratuita de 7 días.

Primero, ¿cuál es tu nombre?`,
  V2_REGISTER_EMAIL: (name: string) => `Gracias, ${name}.

Ahora, ¿cuál es tu correo?`,
  V2_TERMS_CONSENT: `Gracias por compartir tu nombre y correo.

Al hacerlo, autorizas el tratamiento de tus datos según nuestra política de privacidad.
Puedes revisarla aquí: ${TERMS_URL}

Ahora sí, continuemos con tu búsqueda.`,
  V2_TERMS_REJECTED: `Para continuar con tu registro y activar tu prueba, necesito que aceptes los términos.`,
  V2_REJECTION_REASON: `Gracias, eso me ayuda a ajustar mejor la búsqueda.

¿Por qué no te interesó?`,

  V2_TRIAL_ACTIVATED: `Ya activé tu versión free por 7 días.

Durante esta semana te enviaremos ofertas según tu búsqueda.

No tienes que entrar a los portales, nosotros las buscamos por ti.`,

  ASK_ROLE: `Â¡Genial! ðŸŽ¯

*Â¿CuÃ¡l es el cargo o profesiÃ³n PRINCIPAL en el que estÃ¡s buscando empleo?*

ðŸ‘‰ Escribe solo UNO para que la bÃºsqueda sea mÃ¡s acertada.

*Ejemplos:* Asesor Comercial - Marketing - Analista de datos - Auxiliar Administrativo - Ingeniero Industrial - Desarrollador de software`,

  ASK_EXPERIENCE: `Â¡Perfecto! Ahora dime tu nivel de experiencia en este rol: 
Elige una opciÃ³n ðŸ‘‡`,

  ASK_LOCATION: `Excelente. Ahora dime:

Â¿En quÃ© ciudad estÃ¡s buscando empleo?

âš ï¸ *Escribe solo UNA ubicaciÃ³n* (ciudad o paÃ­s)

Ejemplo: "BogotÃ¡", "Lima", "Colombia", "Argentina", etc.`,

  // [DESACTIVADO] Pregunta de modalidad de trabajo (remoto/presencial/hÃ­brido)
  // Puede reactivarse en el futuro si se requiere
  // ASK_WORK_MODE: `Perfecto. Â¿QuÃ© modalidad de trabajo prefieres?
  //
  // ðŸ  *Remoto* - Trabajar desde casa
  // ðŸ¢ *Presencial* - Ir a la oficina
  // ðŸ”„ *HÃ­brido* - Mixto (remoto + presencial)
  // âœ¨ *Sin preferencia* - Cualquier modalidad
  //
  // Selecciona una opciÃ³n.`,

  // [DESACTIVADO] Pregunta de tipo de jornada - No aporta valor significativo
  // ASK_JOB_TYPE: `Â¿QuÃ© tipo de jornada prefieres?
  //
  // 1ï¸âƒ£ Tiempo completo
  // 2ï¸âƒ£ Medio tiempo
  // 3ï¸âƒ£ PasantÃ­a
  // 4ï¸âƒ£ Freelance
  //
  // Responde con el nÃºmero o el nombre.`,

  // [DESACTIVADO] Pregunta de salario - No aporta valor significativo
  // ASK_MIN_SALARY: `Â¿CuÃ¡l es tu salario ideal? (en pesos colombianos)
  //
  // _(Esto nos ayuda a priorizar ofertas que coincidan con tus expectativas, pero tambiÃ©n te mostraremos otras opciones)_
  //
  // Ejemplo: "2000000", "2.5 millones", etc.
  //
  // _Si no tienes una preferencia especÃ­fica, escribe "0"_`,

  // [DESACTIVADO] ASK_ALERT_FREQUENCY - Frecuencia siempre es diaria
  // ASK_ALERT_FREQUENCY: `Â¡Ya casi terminamos! ðŸ””
  //
  // Â¿Con quÃ© frecuencia te gustarÃ­a recibir recordatorios de bÃºsqueda de empleo?
  //
  // 1ï¸âƒ£ Diariamente â˜€ï¸
  // 2ï¸âƒ£ Cada 3 dÃ­as ðŸ“…
  // 3ï¸âƒ£ Semanalmente ðŸ“†
  // 4ï¸âƒ£ Mensualmente ðŸ—“ï¸`,
  ASK_ALERT_FREQUENCY: '', // Mantenido por compatibilidad pero no se usa

  ASK_ALERT_TIME: `Perfecto. â°

Â¿A quÃ© hora quieres recibir las alertas?

Ejemplo: "9:00", "18:30", "10:00 AM", etc.`,

  ASK_ALERT_TIME_MOBILE: `Perfecto. â°

Selecciona la hora en que quieres recibir las alertas:

_Si prefieres otra hora, escrÃ­bela (ej: "20:00", "7:30 AM")_`,

  // Errores de validaciÃ³n
  ERROR_ROLE_INVALID: `Parece que no has especificado un rol para tu búsqueda.

Escríbeme el nombre del cargo o una palabra clave para mostrarte ofertas.

Ejemplo: "Vendedor", "Marketing", "Analista", "Diseñador".`,

  ERROR_EXPERIENCE_INVALID: `No entendÃ­ tu respuesta. Por favor responde con:

1ï¸âƒ£ Sin experiencia
2ï¸âƒ£ Junior (1-2 aÃ±os)
3ï¸âƒ£ Intermedio (3-5 aÃ±os)
4ï¸âƒ£ Senior (5+ aÃ±os)
5ï¸âƒ£ Lead/Expert (7+ aÃ±os)`,

  ERROR_LOCATION_INVALID: `Por favor, ingresa una ciudad o paÃ­s vÃ¡lido.

Ejemplo: "BogotÃ¡", "Lima", "MÃ©xico", "Colombia", "PerÃº", etc.`,

  ERROR_LOCATION_REMOTE_INVALID: `Entiendo que quieres trabajo remoto. ðŸ˜Š

En esta pregunta debes escribir *una ubicaciÃ³n vÃ¡lida* (ciudad o paÃ­s) para continuar.

Ejemplo: "BogotÃ¡", "Colombia", "Lima".

Por favor vuelve a ingresar tu ubicaciÃ³n.`,

  ERROR_LOCATION_TOO_VAGUE: `Esa ubicaciÃ³n es muy amplia para buscar ofertas. ðŸŒŽ

Por favor escribe una *ciudad* o *paÃ­s* especÃ­fico.

Ejemplo: "Colombia", "MÃ©xico", "BogotÃ¡", "Lima", etc.`,

  // [DESACTIVADO] Mensajes de error para modalidad de trabajo
  // Puede reactivarse en el futuro si se requiere
  // ERROR_WORK_MODE_INVALID: `No entendÃ­ tu respuesta. Por favor elige una opciÃ³n:
  //
  // ðŸ  *"Remoto"* - Trabajar desde casa
  // ðŸ¢ *"Presencial"* - Ir a la oficina
  // ðŸ”„ *"HÃ­brido"* - Mixto (remoto + presencial)
  // âœ¨ *"Sin preferencia"* - Cualquier modalidad`,

  // [DESACTIVADO] Mensajes de error para tipo de jornada - No aporta valor significativo
  // ERROR_JOB_TYPE_INVALID: `No entendÃ­ tu respuesta. Por favor responde con:
  //
  // 1ï¸âƒ£ Tiempo completo
  // 2ï¸âƒ£ Medio tiempo
  // 3ï¸âƒ£ PasantÃ­a
  // 4ï¸âƒ£ Freelance`,

  // [DESACTIVADO] Mensajes de error para salario - No aporta valor significativo
  // ERROR_SALARY_INVALID: `Por favor ingresa un salario vÃ¡lido en pesos colombianos (entre 500,000 y 50,000,000) o escribe "0" si no tienes preferencia.
  //
  // Ejemplo: "2000000", "2.5 millones", "0"`,

  // [DESACTIVADO] ERROR_ALERT_FREQUENCY_INVALID - Frecuencia siempre es diaria
  // ERROR_ALERT_FREQUENCY_INVALID: `No entendÃ­ tu respuesta. Por favor responde con:
  //
  // 1ï¸âƒ£ Diariamente â˜€ï¸
  // 2ï¸âƒ£ Cada 3 dÃ­as ðŸ“…
  // 3ï¸âƒ£ Semanalmente ðŸ“†
  // 4ï¸âƒ£ Mensualmente ðŸ—“ï¸`,
  ERROR_ALERT_FREQUENCY_INVALID: '', // Mantenido por compatibilidad pero no se usa

  ERROR_TIME_INVALID: `Por favor ingresa una hora vÃ¡lida.

Ejemplo: "9:00", "18:30", "10:00 AM"`,

  // Mensajes de ayuda
  HELP_MESSAGE: `*Â¿CÃ³mo puedo ayudarte?*

Por ahora estoy en fase de pruebas. Pronto podrÃ¡s:

ðŸ” Escribir "buscar" para ver ofertas de empleo
ðŸ“ Enviar tu CV para personalizar las bÃºsquedas
âš™ï¸ Cambiar tus preferencias de bÃºsqueda

Â¿Necesitas algo mÃ¡s?`,

  // Mensaje cuando no se entiende
  UNKNOWN_INTENT: `No entendÃ­ tu mensaje. ðŸ˜…`,

  // Mensaje cuando el usuario estÃ¡ en estado READY (usado con returnToMainMenu que aÃ±ade menÃº)
  NOT_READY_YET: `Â¡Tu perfil estÃ¡ listo! ðŸŽ‰`,

  // Mensaje de error general
  ERROR_GENERAL: `Lo siento, ocurriÃ³ un error inesperado. ðŸ˜”

Por favor intenta de nuevo en unos momentos.`,

  // Mensaje de retry cuando falla envÃ­o
  ERROR_RETRY: `_Hubo un problema enviando el mensaje anterior. Por favor responde directamente escribiendo tu respuesta._`,

  // Mensajes de gestiÃ³n de cuenta
  CONFIRM_RESTART: `Â¿EstÃ¡s seguro que deseas reiniciar tu perfil? ðŸ”„

Esto eliminarÃ¡ toda tu configuraciÃ³n actual y comenzarÃ¡s desde cero.`,

  RESTART_CANCELLED: `Perfecto, tu perfil se mantiene como estÃ¡. ðŸ‘`,

  RESTARTED: `Tu perfil ha sido reiniciado. Comencemos de nuevo. ðŸ”„`,

  CONFIRM_CANCEL_SERVICE: `Â¿EstÃ¡s seguro que deseas dejar de usar CIO? ðŸ˜¢

Esto eliminarÃ¡ toda tu informaciÃ³n y no recibirÃ¡s mÃ¡s alertas.`,

  SERVICE_CANCELLED: `Listo âœ… 

Tus preferencias se han eliminado y ya no recibirÃ¡s alertas. Tu cuenta sigue activa, asÃ­ que puedes volver cuando quieras. 

ðŸ’¡ _Tip Almia: Aprovecha este tiempo para reforzar tu CV y LinkedIn; pequeÃ±as mejoras hoy pueden abrir grandes oportunidades maÃ±ana._`,

  CANCEL_SERVICE_ABORTED: `Â¡Me alegra que te quedes! ðŸ˜Š Tu perfil sigue activo.`,

  // Mensajes de ediciÃ³n de perfil (ya no se usa, se genera dinÃ¡micamente en showProfileForEditing)
  SHOW_CURRENT_PREFERENCES: (profile: {
    role: string;
    location: string;
    alertTime: string;
  }) => `ðŸ“ *Tus preferencias actuales:*

ðŸ”¹ *Rol:* ${profile.role}
ðŸ”¹ *UbicaciÃ³n:* ${profile.location}
â° *Horario de alertas:* ${profile.alertTime}

Selecciona quÃ© quieres editar en la lista.

ðŸ’¡ _Tips rÃ¡pidos_

ðŸ“ UbicaciÃ³n: si estÃ¡s abierto/a, escribe solo el paÃ­s (ej: Colombia).
Si quieres remoto, igual escribe una ciudad o paÃ­s base (ej: BogotÃ¡ o Colombia).

ðŸŽ¯ Cargo: si no hay resultados, prueba con Ã¡reas (TecnologÃ­a, Ventas, Marketing) o habilidades (Power BI, IA, Excel).`,

  EDIT_FIELD_NOT_FOUND: `No entendÃ­ quÃ© campo quieres editar. ðŸ˜…

Por favor, selecciona una opciÃ³n de la lista.`,

  FIELD_UPDATED: (
    fieldName: string,
    newValue: string,
    name?: string | null,
  ) => `âœ… Perfecto${name ? ` ${name}` : ''}! Tu *${fieldName}* ha sido actualizado a: *${newValue}*

Tu perfil estÃ¡ listo. Puedes:
â€¢ Escribir *"buscar"* para encontrar ofertas ahora
â€¢ Escribir *"editar"* para cambiar otra preferencia
â€¢ Escribir *"reiniciar"* para volver a configurar todo desde cero`,

  // MenÃº de comandos en estado READY
  MENU_READY: `Â¿QuÃ© te gustarÃ­a hacer?

ðŸ“‹ *Comandos disponibles:*

ðŸ” *buscar* - Buscar ofertas de empleo ahora
âœï¸ *editar* - Cambiar tus preferencias
ðŸ”„ *reiniciar* - Reconfigurar tu perfil desde cero
âŒ *cancelar* - Dejar de usar el servicio

Escribe el comando que desees.`,

  // Ofrecer alertas durante onboarding (antes de primera bÃºsqueda)
  OFFER_ALERTS: `Â¡Ya casi terminamos! ðŸŽ¯

Â¿Quieres que te envÃ­e alertas automÃ¡ticas diarias de empleo? ðŸ””

âœ¨ *Beneficios:*
â€¢ No tienes que estar buscando
â€¢ Recibes ofertas actualizadas diarias segÃºn tu perfil
â€¢ TÃº eliges la hora de envÃ­o

ðŸ‘† Elige una opciÃ³n:`,

  // ConfirmaciÃ³n de rechazo de alertas
  ALERTS_DISABLED: `Perfecto, *no activarÃ© las alertas automÃ¡ticas*. âœ…

ðŸŽ¯ *Â¡Tu perfil estÃ¡ listo!*

Ya puedes empezar a buscar ofertas de empleo personalizadas.

_(Si cambias de opiniÃ³n mÃ¡s adelante, puedes activar las alertas desde el menÃº de *"editar"*)_`,

  // [ELIMINADO] Versiones DESKTOP de mensajes - Ya no se usan, todos son tratados como mÃ³vil
  // ASK_TERMS_DESKTOP: (eliminado - ahora todos usan botones interactivos)

  // [ELIMINADO] ASK_JOB_TYPE_DESKTOP - Ya no se usa, todos usan listas interactivas

  // [DESACTIVADO] Mensajes de modalidad de trabajo para versiÃ³n desktop
  // Puede reactivarse en el futuro si se requiere
  // ASK_WORK_MODE_DESKTOP: `Â¿QuÃ© modalidad de trabajo prefieres?
  //
  // Escribe una de estas opciones:
  // â€¢ *"Remoto"* - Para trabajar desde casa ðŸ 
  // â€¢ *"Presencial"* - Para ir a la oficina ðŸ¢
  // â€¢ *"HÃ­brido"* - Para trabajar mixto (remoto + presencial) ðŸ”„
  // â€¢ *"Sin preferencia"* - Para cualquier modalidad âœ¨`,

  // [ELIMINADO] CONFIRM_RESTART_DESKTOP - Ya no se usa, todos usan botones interactivos

  // [ELIMINADO] CONFIRM_CANCEL_SERVICE_DESKTOP - Ya no se usa, todos usan botones interactivos

  // [ELIMINADO] EDITING_PROFILE_DESKTOP - Ya no se usa, todos usan listas interactivas

  // ==========================================
  // MENSAJES DE SISTEMA DE PLANES
  // ==========================================

  // Freemium agotado (primera vez)
  FREEMIUM_EXPIRED: `â³ *Se acabaron tus bÃºsquedas del Plan Free*

No frenes tu bÃºsqueda ahora ðŸ’ª
Con CIO sigues recibiendo ofertas reales y alineadas a tu perfil, sin perder tiempo.

*Elige tu plan:*

ðŸŽ‰ *CIO Premium â€“ $20.000 COP / 30 dÃ­as*
ðŸ‘‰ Activa aquÃ­: ${WOMPI_CHECKOUT_LINK}

ðŸŒŸ *CIO Pro â€“ $54.000 COP / 90 dÃ­as* _(Mejor valor)_
ðŸ‘‰ Activa aquÃ­: ${WOMPI_CHECKOUT_LINK_PRO}

*Ambos planes incluyen:*
ðŸ” Cazar ofertas durante todo tu plan
âœ¨ Mayor cantidad de ofertas por bÃºsqueda
ðŸ”” Alertas diarias por WhatsApp
ðŸŽ¯ BÃºsqueda personalizada segÃºn tu cargo
ðŸ¤ Soporte de un mentor Almia

DespuÃ©s del pago, escrÃ­benos el correo con el que pagaste y activamos tu acceso de inmediato âš¡

ðŸ’¬ Â¿Tienes dudas? EscrÃ­benos +57 3332393280 y te ayudamos.`,

  // Plan pagado expirado (Premium o Pro)
  PREMIUM_EXPIRED: `*â° Tu Plan ha finalizado*

ðŸš€ *No frenes tu bÃºsqueda ahora.*

Para continuar disfrutando de los beneficios de CIO, renueva tu suscripciÃ³n:

*Elige tu plan:*

ðŸŽ‰ *CIO Premium* â€“ $20.000 COP / 30 dÃ­as
ðŸ‘‰ ${WOMPI_CHECKOUT_LINK}

ðŸŒŸ *CIO Pro* â€“ $54.000 COP / 90 dÃ­as _(Mejor valor)_
ðŸ‘‰ ${WOMPI_CHECKOUT_LINK_PRO}

DespuÃ©s del pago, escrÃ­benos el *correo con el que pagaste* y activamos tu acceso automÃ¡ticamente.

ðŸ’¬ Â¿Dudas? EscrÃ­benos por WhatsApp: *+57 333 239 3280*`,

  // Freemium agotado (usuario que vuelve despuÃ©s de cancelar)
  FREEMIUM_EXPIRED_RETURNING_USER: (name?: string | null) => `Â¡Hola${name ? ` ${name}` : ''}! ðŸ‘‹

Veo que ya agotaste tu perÃ­odo de prueba gratuita.

Para continuar usando CIO, elige tu plan:

ðŸŽ‰ *CIO Premium* â€“ $20.000 COP / 30 dÃ­as
ðŸ‘‰ ${WOMPI_CHECKOUT_LINK}

ðŸŒŸ *CIO Pro* â€“ $54.000 COP / 90 dÃ­as _(Mejor valor)_
ðŸ‘‰ ${WOMPI_CHECKOUT_LINK_PRO}

Una vez realices el pago, ingresa el *correo electrÃ³nico* que usaste para pagar.`,

  // Recordatorio de freemium expirado (23 horas despuÃ©s)
  FREEMIUM_REMINDER: (name?: string | null) => `Hola${name ? ` ${name}` : ''} ðŸ‘‹

Veo que aÃºn no has activado un plan.

Recuerda: _las oportunidades no llegan solas, hay que salir a cazarlas con foco._

Yo busco y filtro ofertas segÃºn tu perfil y te las envÃ­o directo a WhatsApp, para ahorrarte tiempo y ruido.

*Elige tu plan:*

ðŸš€ *CIO Premium* â†’ $20.000 COP / 30 dÃ­as
ðŸ‘‰ ${WOMPI_CHECKOUT_LINK}

ðŸŒŸ *CIO Pro* â†’ $54.000 COP / 90 dÃ­as _(Mejor valor)_
ðŸ‘‰ ${WOMPI_CHECKOUT_LINK_PRO}

Mira cÃ³mo funciona:
ðŸ”— https://www.instagram.com/p/DTghZbMDS3O/

Si tienes dudas, puedes hablar con un humano aquÃ­:
ðŸ“± +57 333 239 3280`,

  // Pedir email para vincular pago
  FREEMIUM_EXPIRED_ASK_EMAIL: `Para verificar tu pago, ingresa el *correo electrÃ³nico* que usaste al momento de realizar el pago:`,

  // Email registrado, mostrar enlace de pago
  PAYMENT_LINK: (email: string) => `âœ… Hemos registrado tu correo: *${email}*

ðŸ”— *Realiza tu pago aquÃ­:* ${WOMPI_CHECKOUT_LINK}

ðŸ’¡ *Importante:* Usa el mismo correo (*${email}*) al momento de pagar para que podamos vincular tu cuenta automÃ¡ticamente.

Una vez realizado el pago, escribe *"verificar"* y confirmaremos tu suscripciÃ³n.`,

  // Pago no encontrado
  PAYMENT_NOT_FOUND: `ðŸ˜• No encontramos un pago asociado a tu correo electrÃ³nico.

Verifica que:
1. Hayas completado el pago exitosamente
2. El correo que ingresaste sea el mismo que usaste para pagar

Si el problema persiste, escribe otro correo o contacta soporte.

ðŸ”— *Enlace de pago:* ${WOMPI_CHECKOUT_LINK}`,

  // Pago confirmado exitosamente
  PAYMENT_CONFIRMED: (name?: string | null) => `ðŸŽ‰ *Â¡Felicidades${name ? ` ${name}` : ''}!*

Tu pago ha sido *confirmado exitosamente*.

âœ¨ Ya tienes acceso al *Plan Premium* por 30 dÃ­as:
â€¢ 5 bÃºsquedas semanales (20 al mes)
â€¢ Alertas personalizadas de empleo
â€¢ Soporte prioritario

ðŸ’¡ _Tip Almia: Aplicar a vacantes buenas es mejor que aplicar masivamente._

Â¿QuÃ© te gustarÃ­a hacer?
â€¢ Escribe *"buscar"* para encontrar ofertas ahora`,

  // Ayuda mientras espera pago
  WAITING_PAYMENT_HELP: `ðŸ’¡ *Â¿Necesitas ayuda?*

TambiÃ©n puedes escribir tu *correo electrÃ³nico* si quieres cambiarlo o corregirlo.

ðŸ”— *Enlace de pago:* ${WOMPI_CHECKOUT_LINK}`,

  // LÃ­mite semanal de premium alcanzado
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

    return `â³ *Has alcanzado tu lÃ­mite de 5 bÃºsquedas esta semana.*

Recuerda que tu plan incluye *20 bÃºsquedas al mes* (5 por semana).

ðŸ“… *Tus bÃºsquedas se renovarÃ¡n el ${formattedDate}*

ðŸ’¡ _Aplicar a vacantes buenas es mejor que aplicar masivamente._

Mientras tanto, puedes:
â€¢ Revisar las ofertas que ya te enviamos
â€¢ Editar tu perfil con *"editar"* para mejores resultados`;
  },

  // Email invÃ¡lido
  ERROR_EMAIL_INVALID: `Por favor, ingresa un correo electrÃ³nico vÃ¡lido.

Ejemplo: tu.correo@ejemplo.com`,

  // Bienvenida para usuario premium que vuelve
  WELCOME_BACK_PREMIUM: (name?: string | null) => `Â¡Hola de nuevo${name ? `, ${name}` : ''}! ðŸ‘‹

Veo que tienes el *Plan Premium* activo. Â¡Continuemos!`,

  // Info de usos restantes (mostrar despuÃ©s de bÃºsqueda)
  USES_REMAINING_FREEMIUM: (usesLeft: number) => `

ðŸ“Š _Te quedan *${usesLeft}* bÃºsqueda${usesLeft !== 1 ? 's' : ''} gratuita${usesLeft !== 1 ? 's' : ''}._`,

  USES_REMAINING_PREMIUM: (usesLeft: number) => `

ðŸ“Š _Te quedan *${usesLeft}* bÃºsqueda${usesLeft !== 1 ? 's' : ''} esta semana._`,
};

