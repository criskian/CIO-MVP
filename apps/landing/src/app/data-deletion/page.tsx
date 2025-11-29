import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Eliminación de Datos - CIO by Almia',
  description: 'Instrucciones para solicitar la eliminación de sus datos personales en CIO - Cazador Inteligente de Oportunidades',
};

export default function DataDeletion() {
  const currentDate = new Date().toLocaleDateString('es-CO', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-[#9054C6] py-6 px-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/assets/images/AlmiaLogoBlanco.svg"
              alt="Almia Logo"
              width={120}
              height={40}
              className="brightness-0 invert"
            />
          </Link>
          <Link 
            href="/"
            className="text-white hover:text-white/80 transition-colors text-sm font-medium"
          >
            ← Volver al inicio
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-[#2C2C2C] mb-2">
          Eliminación de Datos de Usuario
        </h1>
        <p className="text-gray-500 mb-8">Última actualización: {currentDate}</p>

        <div className="prose prose-lg max-w-none text-[#2C2C2C]">
          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">Su Derecho a la Eliminación de Datos</h2>
            <p className="mb-4 leading-relaxed">
              En <strong>Almia Consulting SAS</strong>, respetamos su derecho a controlar sus datos personales. 
              De acuerdo con la Ley 1581 de 2012 de Colombia y las políticas de Meta (WhatsApp), usted tiene 
              derecho a solicitar la eliminación completa de todos los datos personales que hemos recopilado 
              a través de nuestro servicio <strong>CIO - Cazador Inteligente de Oportunidades</strong>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">Datos que Serán Eliminados</h2>
            <p className="mb-4 leading-relaxed">
              Al solicitar la eliminación de sus datos, eliminaremos permanentemente:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Información de cuenta:</strong> Su número de teléfono de WhatsApp y datos de identificación.</li>
              <li><strong>Perfil de búsqueda:</strong> Rol buscado, ubicación, tipo de jornada, expectativa salarial, 
              preferencias de trabajo remoto.</li>
              <li><strong>Preferencias de alertas:</strong> Hora de envío de alertas, zona horaria, configuración de notificaciones.</li>
              <li><strong>Hoja de vida (CV):</strong> Si proporcionó su CV, será eliminado de nuestros sistemas de almacenamiento.</li>
              <li><strong>Historial de conversación:</strong> Todos los mensajes intercambiados con CIO.</li>
              <li><strong>Historial de ofertas:</strong> Registro de ofertas de empleo enviadas y búsquedas realizadas.</li>
              <li><strong>Datos de sesión:</strong> Estado de la conversación y datos temporales.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">Cómo Solicitar la Eliminación de sus Datos</h2>
            <p className="mb-4 leading-relaxed">
              Puede solicitar la eliminación de sus datos de las siguientes maneras:
            </p>

            <div className="bg-gray-50 p-6 rounded-lg mb-6">
              <h3 className="font-bold text-[#2C2C2C] mb-3">Opción 1: A través de WhatsApp (Recomendado)</h3>
              <p className="text-gray-600 mb-3">
                Envíe un mensaje a CIO con el texto: <strong>"Eliminar mis datos"</strong> o 
                <strong> "Quiero eliminar mi cuenta"</strong>
              </p>
              <a 
                href="https://wa.me/573135064977?text=Quiero%20eliminar%20mis%20datos%20de%20CIO"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#25D366] text-white font-medium rounded-lg hover:bg-[#128C7E] transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
                Solicitar eliminación por WhatsApp
              </a>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg mb-6">
              <h3 className="font-bold text-[#2C2C2C] mb-3">Opción 2: Por correo electrónico</h3>
              <p className="text-gray-600 mb-3">
                Envíe un correo a <a href="mailto:Contacto@almia.com.co" className="text-[#9054C6] hover:underline">Contacto@almia.com.co</a> con 
                el asunto: <strong>"Solicitud de eliminación de datos - CIO"</strong>
              </p>
              <p className="text-gray-600 text-sm">
                Incluya en el correo el número de teléfono de WhatsApp asociado a su cuenta para que podamos 
                identificar y eliminar sus datos correctamente.
              </p>
            </div>

            <div className="bg-gray-50 p-6 rounded-lg">
              <h3 className="font-bold text-[#2C2C2C] mb-3">Opción 3: Formulario de contacto</h3>
              <p className="text-gray-600 mb-3">
                Puede llamarnos o enviarnos un mensaje directo a nuestro WhatsApp de atención al cliente:
              </p>
              <p className="text-gray-600">
                <a href="https://wa.me/573135064977" className="text-[#9054C6] hover:underline">+57 (313) 506-4977</a>
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">Proceso de Eliminación</h2>
            <p className="mb-4 leading-relaxed">
              Una vez recibida su solicitud:
            </p>
            <ol className="list-decimal pl-6 mb-4 space-y-3">
              <li>
                <strong>Verificación de identidad:</strong> Verificaremos que la solicitud proviene del 
                titular de los datos mediante el número de WhatsApp registrado.
              </li>
              <li>
                <strong>Confirmación:</strong> Le enviaremos una confirmación de recepción de su solicitud 
                en un plazo máximo de 2 días hábiles.
              </li>
              <li>
                <strong>Procesamiento:</strong> Procederemos a eliminar todos sus datos de nuestros sistemas 
                activos en un plazo máximo de 15 días hábiles.
              </li>
              <li>
                <strong>Copias de seguridad:</strong> Los datos en copias de seguridad serán eliminados en 
                el siguiente ciclo de rotación de backups (máximo 30 días adicionales).
              </li>
              <li>
                <strong>Confirmación final:</strong> Le notificaremos por correo electrónico o WhatsApp 
                cuando la eliminación haya sido completada.
              </li>
            </ol>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">Datos que Podemos Retener</h2>
            <p className="mb-4 leading-relaxed">
              En algunos casos, podemos estar obligados a retener cierta información por razones legales, 
              regulatorias o de seguridad:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Registros de transacciones si hubo algún pago (para cumplimiento tributario).</li>
              <li>Registros de solicitudes de eliminación (para demostrar cumplimiento legal).</li>
              <li>Información necesaria para resolver disputas legales pendientes.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              Estos datos retenidos serán mínimos y se mantendrán de forma segura solo durante el tiempo 
              legalmente requerido.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">Consecuencias de la Eliminación</h2>
            <p className="mb-4 leading-relaxed">
              Al eliminar sus datos:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Ya no recibirá alertas de ofertas de empleo de CIO.</li>
              <li>Su perfil de búsqueda y preferencias serán eliminados permanentemente.</li>
              <li>No podremos recuperar su información una vez eliminada.</li>
              <li>Si desea usar CIO nuevamente en el futuro, deberá crear un nuevo perfil desde cero.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">Preguntas Frecuentes</h2>
            
            <div className="space-y-4">
              <div className="border-l-4 border-[#9054C6] pl-4">
                <h3 className="font-bold text-[#2C2C2C]">¿Cuánto tiempo tarda la eliminación?</h3>
                <p className="text-gray-600">
                  La eliminación de sus datos de nuestros sistemas activos se completará en un máximo de 
                  15 días hábiles. Las copias de seguridad se actualizarán en un plazo máximo de 30 días adicionales.
                </p>
              </div>
              
              <div className="border-l-4 border-[#9054C6] pl-4">
                <h3 className="font-bold text-[#2C2C2C]">¿Puedo recuperar mis datos después de eliminarlos?</h3>
                <p className="text-gray-600">
                  No. Una vez completado el proceso de eliminación, sus datos no pueden ser recuperados. 
                  Si desea usar CIO nuevamente, deberá crear un nuevo perfil.
                </p>
              </div>
              
              <div className="border-l-4 border-[#9054C6] pl-4">
                <h3 className="font-bold text-[#2C2C2C]">¿Qué pasa con los mensajes en WhatsApp?</h3>
                <p className="text-gray-600">
                  Eliminaremos todos los registros de conversación de nuestros servidores. Sin embargo, 
                  los mensajes en su dispositivo de WhatsApp son controlados por usted y por Meta, no por Almia.
                </p>
              </div>
              
              <div className="border-l-4 border-[#9054C6] pl-4">
                <h3 className="font-bold text-[#2C2C2C]">¿Puedo eliminar solo parte de mis datos?</h3>
                <p className="text-gray-600">
                  Sí. Si desea actualizar o eliminar solo ciertos datos (como su CV o preferencias específicas), 
                  puede hacerlo a través de CIO o contactándonos directamente.
                </p>
              </div>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">Contacto</h2>
            <p className="mb-4 leading-relaxed">
              Si tiene preguntas sobre la eliminación de sus datos o necesita asistencia:
            </p>
            <div className="bg-gray-50 p-6 rounded-lg">
              <p className="font-bold text-[#2C2C2C] mb-2">Almia Consulting SAS</p>
              <p className="text-gray-600">Cali, Colombia</p>
              <p className="text-gray-600">
                Correo: <a href="mailto:Contacto@almia.com.co" className="text-[#9054C6] hover:underline">Contacto@almia.com.co</a>
              </p>
              <p className="text-gray-600">
                WhatsApp: <a href="https://wa.me/573135064977" className="text-[#9054C6] hover:underline">+57 (313) 506-4977</a>
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-[#9054C6] py-6 px-4">
        <div className="max-w-4xl mx-auto text-center text-white/80 text-sm">
          © {new Date().getFullYear()} Almia Consulting SAS - Todos los derechos reservados
        </div>
      </footer>
    </main>
  );
}

