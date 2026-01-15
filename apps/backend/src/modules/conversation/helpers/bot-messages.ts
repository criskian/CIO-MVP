/**
 * Mensajes del bot CIO
 */

// CONFIGURACIÓN DE LINKS
const WOMPI_CHECKOUT_LINK = process.env.WOMPI_CHECKOUT_LINK || 'https://checkout.wompi.co/l/xTJSuZ';
const LANDING_URL = 'https://cio-stg.almia.com.co';
const TERMS_URL = `${LANDING_URL}/terms-of-service`;
const PRIVACY_URL = `${LANDING_URL}/privacy-policy`;

export const BotMessages = {
  // BIENVENIDA Y NOMBRE

  // Bienvenida (usada internamente, ya no se muestra sola)
  WELCOME: `¡Hola! 👋 Soy *CIO, tu Cazador Inteligente de Ofertas* by ALMIA.

Estás usando la *versión Free*: Estoy aquí para ayudarte a encontrar las *mejores ofertas de empleo en Colombia*, de forma rápida y personalizada. Conmigo podrás:

✨ Buscar empleos ajustados a tu perfil
✨ Recibir alertas diarias según tus intereses
✨ Ajustar filtros por ubicación, salario y tipo de empleo`,

  // Usuario no registrado - debe registrarse en la landing
  NOT_REGISTERED: `👋 ¡Hola! Veo que aún no estás registrado en CIO.

Para usar el *Cazador Inteligente de Ofertas*, primero debes registrarte en nuestra página web:

🔗 *Regístrate aquí:* https://cio-stg.almia.com.co

El registro es *gratis* y solo toma unos segundos. Una vez registrado, podrás comenzar a buscar ofertas de empleo personalizadas.`,

  // Bienvenida para usuario registrado (primera vez en el chat)
  WELCOME_REGISTERED: (name: string) => `¡Hola *${name}*! 👋 Bienvenido a CIO, tu Cazador Inteligente de Ofertas.

Estás usando la *versión Free*: Estoy aquí para ayudarte a encontrar las *mejores ofertas de empleo en Colombia* 🇨🇴, de forma rápida y personalizada.

✨ *Incluye:*
• 3 búsquedas personalizadas GRATIS
• Válido por 3 días desde tu registro
• Alertas de empleo según tus preferencias`,

  // Mensaje cuando completa el onboarding
  ONBOARDING_COMPLETE: (name: string) => `¡Perfecto, *${name}*! ✅ Tu perfil está listo.

🎯 *Ya puedes empezar a buscar ofertas!*

Escribe *"buscar"* cuando estés listo y te mostraré las mejores ofertas que encontré para ti.

📋 *Otros comandos disponibles:*
✏️ *editar* - Cambiar tus preferencias
🔄 *reiniciar* - Reconfigurar tu perfil
❌ *cancelar* - Dejar de usar el servicio`,

  // [ELIMINADO] DISPOSITIVO - Ya no se pregunta, asumimos celular
  // ASK_DEVICE: (eliminado - todos los usuarios se tratan como móvil)

  // Términos y condiciones
  ASK_TERMS: `Antes de comenzar, necesitamos tu autorización. Al seleccionar *"Acepto"*, confirmas que:

• Tienes *16 años o más*
• Si eres menor de 18 años, cuentas con autorización de tu padre, madre o representante legal
• Entiendes que el CIO ofrece una *prueba gratuita de 3 días*. Finalizado este periodo, deberás adquirir un *plan de pago* para continuar usando el servicio
• Has leído y aceptas los *Términos y Condiciones del servicio*
• Autorizas el tratamiento de tus datos personales conforme a la *Política de Privacidad* de Almia Consulting S.A.S., de acuerdo con la Ley 1581 de 2012

📄 *Consulta los documentos aquí:*

👉 Términos y Condiciones: ${TERMS_URL}

👉 Política de Privacidad: ${PRIVACY_URL}`,

  // Rechazo de términos
  TERMS_REJECTED: `Entiendo. Si cambias de opinión, puedes escribirme de nuevo cuando quieras. ¡Éxito en tu búsqueda de empleo! 👋`,

  // Preguntas del onboarding
  ASK_ROLE: `¡Perfecto! Comencemos 🎯

*¿Cuál es el cargo o rol PRINCIPAL en el que te gustaría trabajar ahora?*

Escribe el más importante para ti en este momento.

*Ejemplos:*
• "Vendedor"
• "Marketing"
• "Analista de datos"
• "Asistente administrativo"
• "Diseñador UX"
• "Ingeniero industrial"

_Luego podrás agregar otros roles o ajustarlo editando tu perfil._`,

  ASK_EXPERIENCE: `Genial. Ahora dime:

¿Cuántos años de experiencia tienes en este campo?

1️⃣ Sin experiencia
2️⃣ Junior (1-2 años)
3️⃣ Intermedio (3-5 años)
4️⃣ Senior (5+ años)
5️⃣ Lead/Expert (7+ años)

Responde con el número o el nombre.`,

  ASK_LOCATION: `Excelente. Ahora dime:

¿En qué ciudad estás buscando empleo?

_(Si no tienes una ciudad específica, dinos al menos el país de preferencia, es necesario para la búsqueda)_

Ejemplo: "Bogotá", "Lima", "Colombia", "Argentina", etc.`,

  // [DESACTIVADO] Pregunta de modalidad de trabajo (remoto/presencial/híbrido)
  // Puede reactivarse en el futuro si se requiere
  // ASK_WORK_MODE: `Perfecto. ¿Qué modalidad de trabajo prefieres?
  //
  // 🏠 *Remoto* - Trabajar desde casa
  // 🏢 *Presencial* - Ir a la oficina
  // 🔄 *Híbrido* - Mixto (remoto + presencial)
  // ✨ *Sin preferencia* - Cualquier modalidad
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
  // _(Esto nos ayuda a priorizar ofertas que coincidan con tus expectativas, pero también te mostraremos otras opciones)_
  //
  // Ejemplo: "2000000", "2.5 millones", etc.
  //
  // _Si no tienes una preferencia específica, escribe "0"_`,

  ASK_ALERT_FREQUENCY: `¡Ya casi terminamos! 🔔

¿Con qué frecuencia te gustaría recibir recordatorios de búsqueda de empleo?

1️⃣ Diariamente ☀️
2️⃣ Cada 3 días 📅
3️⃣ Semanalmente 📆
4️⃣ Mensualmente 🗓️

Responde con el número o el nombre de la opción.`,

  ASK_ALERT_TIME: `Perfecto. ⏰

¿A qué hora quieres recibir las alertas?

Ejemplo: "9:00", "18:30", "10:00 AM", etc.`,

  ASK_ALERT_TIME_MOBILE: `Perfecto. ⏰

Selecciona la hora en que quieres recibir las alertas:

_Si prefieres otra hora, escríbela (ej: "20:00", "7:30 AM")_`,

  // Errores de validación
  ERROR_ROLE_INVALID: `Por favor, ingresa un cargo o rol válido (al menos 2 caracteres).

Ejemplo: "Vendedor", "Marketing", "Analista", "Diseñador", etc.`,

  ERROR_EXPERIENCE_INVALID: `No entendí tu respuesta. Por favor responde con:

1️⃣ Sin experiencia
2️⃣ Junior (1-2 años)
3️⃣ Intermedio (3-5 años)
4️⃣ Senior (5+ años)
5️⃣ Lead/Expert (7+ años)`,

  ERROR_LOCATION_INVALID: `Por favor, ingresa una ciudad o país válido.

Ejemplo: "Bogotá", "Lima", "México", "Colombia", "Perú", etc.`,

  // [DESACTIVADO] Mensajes de error para modalidad de trabajo
  // Puede reactivarse en el futuro si se requiere
  // ERROR_WORK_MODE_INVALID: `No entendí tu respuesta. Por favor elige una opción:
  //
  // 🏠 *"Remoto"* - Trabajar desde casa
  // 🏢 *"Presencial"* - Ir a la oficina
  // 🔄 *"Híbrido"* - Mixto (remoto + presencial)
  // ✨ *"Sin preferencia"* - Cualquier modalidad`,

  // [DESACTIVADO] Mensajes de error para tipo de jornada - No aporta valor significativo
  // ERROR_JOB_TYPE_INVALID: `No entendí tu respuesta. Por favor responde con:
  //
  // 1️⃣ Tiempo completo
  // 2️⃣ Medio tiempo
  // 3️⃣ Pasantía
  // 4️⃣ Freelance`,

  // [DESACTIVADO] Mensajes de error para salario - No aporta valor significativo
  // ERROR_SALARY_INVALID: `Por favor ingresa un salario válido en pesos colombianos (entre 500,000 y 50,000,000) o escribe "0" si no tienes preferencia.
  //
  // Ejemplo: "2000000", "2.5 millones", "0"`,

  ERROR_ALERT_FREQUENCY_INVALID: `No entendí tu respuesta. Por favor responde con:

1️⃣ Diariamente ☀️
2️⃣ Cada 3 días 📅
3️⃣ Semanalmente 📆
4️⃣ Mensualmente 🗓️`,

  ERROR_TIME_INVALID: `Por favor ingresa una hora válida.

Ejemplo: "9:00", "18:30", "10:00 AM"`,

  // Mensajes de ayuda
  HELP_MESSAGE: `*¿Cómo puedo ayudarte?*

Por ahora estoy en fase de pruebas. Pronto podrás:

🔍 Escribir "buscar" para ver ofertas de empleo
📝 Enviar tu CV para personalizar las búsquedas
⚙️ Cambiar tus preferencias de búsqueda

¿Necesitas algo más?`,

  // Mensaje cuando no se entiende
  UNKNOWN_INTENT: `No entendí tu mensaje. 😅

Si necesitas ayuda, escribe "ayuda".`,

  // Mensaje cuando el usuario está en estado READY
  NOT_READY_YET: `¡Tu perfil está listo! 🎉

_Comandos disponibles:_
• Escribe *"buscar"* para encontrar ofertas de empleo ahora
• Escribe *"editar"* para cambiar alguna preferencia
• Escribe *"reiniciar"* para volver a configurar tu perfil desde cero
• Escribe *"cancelar"* si deseas dejar de usar el servicio

¿Qué te gustaría hacer?`,

  // Mensaje de error general
  ERROR_GENERAL: `Lo siento, ocurrió un error inesperado. 😔

Por favor intenta de nuevo en unos momentos.`,

  // Mensaje de retry cuando falla envío
  ERROR_RETRY: `_Hubo un problema enviando el mensaje anterior. Por favor responde directamente escribiendo tu respuesta._`,

  // Mensajes de gestión de cuenta
  CONFIRM_RESTART: `¿Estás seguro que deseas reiniciar tu perfil? 🔄

Esto eliminará toda tu configuración actual y comenzarás desde cero.

Responde *"Sí"* para confirmar o *"No"* para cancelar.`,

  RESTART_CANCELLED: `Perfecto, tu perfil se mantiene como está. 👍`,

  RESTARTED: `Tu perfil ha sido reiniciado. Comencemos de nuevo. 🔄`,

  CONFIRM_CANCEL_SERVICE: `¿Estás seguro que deseas dejar de usar CIO? 😢

Esto eliminará toda tu información y no recibirás más alertas.

Responde *"Sí"* para confirmar o *"No"* para continuar usando el servicio.`,

  SERVICE_CANCELLED: `Entiendo. Tus preferencias de búsqueda han sido eliminadas y ya no recibirás alertas.

Tu cuenta permanece registrada. Si cambias de opinión en el futuro, puedes escribirme nuevamente para reconfigurar tus preferencias.

¡Mucha suerte en tu búsqueda de empleo! 🍀`,

  CANCEL_SERVICE_ABORTED: `¡Me alegra que te quedes! 😊 Tu perfil sigue activo.`,

  // Mensajes de edición de perfil
  SHOW_CURRENT_PREFERENCES: (profile: {
    role: string;
    location: string;
    jobType: string;
    minSalary: string;
    alertFrequency: string;
    alertTime: string;
  }) => `📝 *Tus preferencias actuales:*

🔹 *Rol:* ${profile.role}
🔹 *Ubicación:* ${profile.location}
🔹 *Tipo de empleo:* ${profile.jobType}
🔹 *Salario ideal:* ${profile.minSalary}
🔹 *Frecuencia de alertas:* ${profile.alertFrequency}
🔹 *Horario de alertas:* ${profile.alertTime}

---

Para editar una preferencia, escribe el *nombre del campo* que quieres cambiar.

*Ejemplos:*
• Escribe *"rol"* para cambiar tu cargo deseado
• Escribe *"ubicación"* para cambiar la ciudad
• Escribe *"tipo"* para cambiar el tipo de empleo
• Escribe *"salario"* para cambiar tu salario ideal
• Escribe *"frecuencia"* para cambiar la frecuencia de alertas
• Escribe *"horario"* para cambiar la hora de alertas

También puedes escribir *"cancelar"* para volver al menú principal.`,

  EDIT_FIELD_NOT_FOUND: `No entendí qué campo quieres editar. 😅

Por favor, escribe uno de estos nombres:
• *"rol"*
• *"ubicación"*
• *"tipo"*
• *"salario"*
• *"frecuencia"*
• *"horario"*

O escribe *"cancelar"* para volver.`,

  FIELD_UPDATED: (
    fieldName: string,
    newValue: string,
  ) => `✅ Perfecto! Tu *${fieldName}* ha sido actualizado a: *${newValue}*

Tu perfil está listo. Puedes:
• Escribir *"buscar"* para encontrar ofertas ahora
• Escribir *"editar"* para cambiar otra preferencia
• Escribir *"reiniciar"* para volver a configurar todo desde cero`,

  // Menú de comandos en estado READY
  MENU_READY: `¿Qué te gustaría hacer?

📋 *Comandos disponibles:*

🔍 *buscar* - Buscar ofertas de empleo ahora
✏️ *editar* - Cambiar tus preferencias
🔄 *reiniciar* - Reconfigurar tu perfil desde cero
❌ *cancelar* - Dejar de usar el servicio

Escribe el comando que desees.`,

  // Ofrecer alertas después de primera búsqueda
  OFFER_ALERTS: `¿Te gustaría recibir *alertas automáticas* de empleo? 🔔

Si activas las alertas, te enviaré ofertas nuevas directamente a este chat según tus preferencias.

📬 *Beneficios:*
• No tienes que acordarte de buscar
• Recibes ofertas frescas automáticamente
• Puedes elegir la frecuencia (diario, semanal, etc.)

Responde:
• *"Sí"* o *"Activar"* para configurar alertas
• *"No"* o *"Sin alertas"* si prefieres buscar manualmente`,

  // Confirmación de rechazo de alertas
  ALERTS_DISABLED: `Perfecto, *no activaré las alertas automáticas*. ✅

Puedes buscar ofertas cuando quieras escribiendo *"buscar"*.

_(Si cambias de opinión más adelante, puedes activar las alertas desde el menú de *"editar"*)_`,

  // [ELIMINADO] Versiones DESKTOP de mensajes - Ya no se usan, todos son tratados como móvil
  // ASK_TERMS_DESKTOP: (eliminado - ahora todos usan botones interactivos)

  // [ELIMINADO] ASK_JOB_TYPE_DESKTOP - Ya no se usa, todos usan listas interactivas

  // [DESACTIVADO] Mensajes de modalidad de trabajo para versión desktop
  // Puede reactivarse en el futuro si se requiere
  // ASK_WORK_MODE_DESKTOP: `¿Qué modalidad de trabajo prefieres?
  //
  // Escribe una de estas opciones:
  // • *"Remoto"* - Para trabajar desde casa 🏠
  // • *"Presencial"* - Para ir a la oficina 🏢
  // • *"Híbrido"* - Para trabajar mixto (remoto + presencial) 🔄
  // • *"Sin preferencia"* - Para cualquier modalidad ✨`,

  // [ELIMINADO] CONFIRM_RESTART_DESKTOP - Ya no se usa, todos usan botones interactivos

  // [ELIMINADO] CONFIRM_CANCEL_SERVICE_DESKTOP - Ya no se usa, todos usan botones interactivos

  // [ELIMINADO] EDITING_PROFILE_DESKTOP - Ya no se usa, todos usan listas interactivas

  // ==========================================
  // MENSAJES DE SISTEMA DE PLANES
  // ==========================================

  // Freemium agotado (primera vez)
  FREEMIUM_EXPIRED: `*⏳ Tu acceso gratuito a CIO ha finalizado*

Ya usaste tus 3 alertas gratuitas o han pasado 3 días desde tu registro.

🚀 *No frenes tu búsqueda ahora.*

Con *CIO Premium* sigues recibiendo *ofertas reales y alineadas a tu perfil*, sin perder tiempo buscando manualmente.

Por solo *$20.000 COP* tienes acceso por *30 días* a:

✅ Hasta *20 búsquedas de empleo al mes*

✅ *Alertas personalizadas* directo a WhatsApp

✅ Ahorro de horas semanales buscando vacantes

🔐 *Activa tu Plan Premium aquí por solo $20.000 COP:*

${WOMPI_CHECKOUT_LINK}

Después del pago, solo escríbenos el *correo con el que pagaste* y activamos tu acceso automáticamente.

💬 ¿Tienes dudas o quieres hablar con un humano?

Escríbenos directamente por WhatsApp: *+57 333 239 3280*`,

  // Freemium agotado (usuario que vuelve después de cancelar)
  FREEMIUM_EXPIRED_RETURNING_USER: (name?: string | null) => `¡Hola${name ? ` ${name}` : ''}! 👋

Veo que ya agotaste tu período de prueba gratuita anteriormente.

Para continuar usando CIO, necesitas activar el *Plan Premium*.

🔗 *Enlace de pago:* ${WOMPI_CHECKOUT_LINK}

Una vez realices el pago, ingresa el *correo electrónico* que usaste para pagar.`,

  // Recordatorio de freemium expirado (23 horas después)
  FREEMIUM_REMINDER: (name?: string | null) => `Hola${name ? ` ${name}` : ''} 👋

Veo que aún no has activado *Premium*.

Recuerda: _las oportunidades no llegan solas, hay que salir a cazarlas con foco._

Yo busco y filtro ofertas según tu perfil y te las envío directo a WhatsApp, para ahorrarte tiempo y ruido.

🚀 *CIO Premium* → $20.000 COP / 30 días

🔗 *Activa aquí:* ${WOMPI_CHECKOUT_LINK}

Mira cómo funciona:
🔗 https://www.instagram.com/p/DTghZbMDS3O/

Si tienes dudas, puedes hablar con un humano aquí:
📱 +57 333 239 3280`,

  // Pedir email para vincular pago
  FREEMIUM_EXPIRED_ASK_EMAIL: `Para verificar tu pago, ingresa el *correo electrónico* que usaste al momento de realizar el pago:`,

  // Email registrado, mostrar enlace de pago
  PAYMENT_LINK: (email: string) => `✅ Hemos registrado tu correo: *${email}*

🔗 *Realiza tu pago aquí:* ${WOMPI_CHECKOUT_LINK}

💡 *Importante:* Usa el mismo correo (*${email}*) al momento de pagar para que podamos vincular tu cuenta automáticamente.

Una vez realizado el pago, escribe *"verificar"* y confirmaremos tu suscripción.`,

  // Pago no encontrado
  PAYMENT_NOT_FOUND: `😕 No encontramos un pago asociado a tu correo electrónico.

Verifica que:
1. Hayas completado el pago exitosamente
2. El correo que ingresaste sea el mismo que usaste para pagar

Si el problema persiste, escribe otro correo o contacta soporte.

🔗 *Enlace de pago:* ${WOMPI_CHECKOUT_LINK}`,

  // Pago confirmado exitosamente
  PAYMENT_CONFIRMED: (name?: string | null) => `🎉 *¡Felicidades${name ? ` ${name}` : ''}!*

Tu pago ha sido *confirmado exitosamente*.

✨ Ya tienes acceso al *Plan Premium* por 30 días:
• 5 búsquedas semanales (20 al mes)
• Alertas personalizadas de empleo
• Soporte prioritario

💡 _Recuerda: aplicar a vacantes buenas es mejor que aplicar masivamente._

¿Qué te gustaría hacer?
• Escribe *"buscar"* para encontrar ofertas ahora`,

  // Ayuda mientras espera pago
  WAITING_PAYMENT_HELP: `💡 *¿Necesitas ayuda?*

• Escribe *"verificar"* para comprobar si tu pago fue procesado
• Escribe tu *correo electrónico* si quieres cambiarlo o corregirlo

🔗 *Enlace de pago:* ${WOMPI_CHECKOUT_LINK}`,

  // Límite semanal de premium alcanzado
  PREMIUM_WEEKLY_LIMIT_REACHED: `⏳ Has alcanzado tu límite de 5 búsquedas esta semana.

Recuerda que tu plan incluye *20 búsquedas al mes* (5 por semana).

💡 _Aplicar a vacantes buenas es mejor que aplicar masivamente._

Tus búsquedas se renovarán en *7 días* desde tu última renovación.

Mientras tanto, puedes:
• Revisar las ofertas que ya te enviamos
• Editar tu perfil para mejores resultados la próxima semana`,

  // Email inválido
  ERROR_EMAIL_INVALID: `Por favor, ingresa un correo electrónico válido.

Ejemplo: tu.correo@ejemplo.com`,

  // Bienvenida para usuario premium que vuelve
  WELCOME_BACK_PREMIUM: (name?: string | null) => `¡Hola de nuevo${name ? `, ${name}` : ''}! 👋

Veo que tienes el *Plan Premium* activo. ¡Continuemos!`,

  // Info de usos restantes (mostrar después de búsqueda)
  USES_REMAINING_FREEMIUM: (usesLeft: number) => `

📊 _Te quedan *${usesLeft}* búsqueda${usesLeft !== 1 ? 's' : ''} gratuita${usesLeft !== 1 ? 's' : ''}._`,

  USES_REMAINING_PREMIUM: (usesLeft: number) => `

📊 _Te quedan *${usesLeft}* búsqueda${usesLeft !== 1 ? 's' : ''} esta semana._`,
};
