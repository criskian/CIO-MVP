import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidad - CIO by Almia',
  description: 'Política de privacidad y tratamiento de datos personales de CIO - Cazador Inteligente de Oportunidades',
};

export default function PrivacyPolicy() {
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
          Política de Privacidad
        </h1>
        <p className="text-gray-500 mb-8">Última actualización: {currentDate}</p>

        <div className="prose prose-lg max-w-none text-[#2C2C2C]">
          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">1. Introducción</h2>
            <p className="mb-4 leading-relaxed">
              <strong>Almia Consulting SAS</strong> (en adelante "Almia", "nosotros" o "la Empresa"), 
              con domicilio en Cali, Colombia, es responsable del tratamiento de los datos personales 
              que usted nos proporciona a través de nuestro servicio <strong>CIO - Cazador Inteligente 
              de Oportunidades</strong>.
            </p>
            <p className="mb-4 leading-relaxed">
              Esta Política de Privacidad describe cómo recopilamos, usamos, almacenamos y protegemos 
              su información personal en cumplimiento con la Ley 1581 de 2012 (Ley de Protección de 
              Datos Personales de Colombia) y demás normativa aplicable.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">2. Datos que Recopilamos</h2>
            <p className="mb-4 leading-relaxed">
              Para prestar nuestros servicios de búsqueda de empleo automatizada, recopilamos los 
              siguientes datos personales:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Número de teléfono de WhatsApp:</strong> Para identificarlo y comunicarnos con usted.</li>
              <li><strong>Preferencias laborales:</strong> Rol o cargo buscado, ubicación preferida, tipo de jornada 
              (tiempo completo, medio tiempo, pasantía, freelance), expectativa salarial mínima, y si acepta trabajo remoto.</li>
              <li><strong>Hora preferida de alertas:</strong> Para enviarle notificaciones de ofertas de empleo en el momento que usted elija.</li>
              <li><strong>Hoja de vida (CV):</strong> Si usted decide compartirla voluntariamente, para mejorar la personalización de las búsquedas.</li>
              <li><strong>Historial de conversación:</strong> Los mensajes intercambiados con nuestro asistente para mejorar el servicio.</li>
              <li><strong>Historial de ofertas enviadas:</strong> Para evitar enviarle ofertas duplicadas.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">3. Finalidad del Tratamiento</h2>
            <p className="mb-4 leading-relaxed">
              Utilizamos sus datos personales para las siguientes finalidades:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Crear y mantener su perfil de búsqueda de empleo.</li>
              <li>Realizar búsquedas personalizadas de ofertas de empleo que coincidan con su perfil.</li>
              <li>Enviarle alertas diarias con ofertas de empleo relevantes a través de WhatsApp.</li>
              <li>Mejorar nuestros algoritmos de búsqueda y recomendación.</li>
              <li>Brindarle soporte y atención al cliente.</li>
              <li>Cumplir con obligaciones legales y regulatorias.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">4. Compartición de Datos con Terceros</h2>
            <p className="mb-4 leading-relaxed">
              Para prestar nuestros servicios, compartimos ciertos datos con los siguientes proveedores de servicios:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Meta (WhatsApp Business API):</strong> Para la comunicación a través de WhatsApp. 
              Meta procesa los mensajes según su propia política de privacidad.</li>
              <li><strong>SerpAPI:</strong> Para realizar búsquedas de ofertas de empleo en múltiples portales. 
              Solo enviamos los criterios de búsqueda (rol, ubicación), no datos personales identificables.</li>
              <li><strong>Amazon Web Services (AWS Bedrock):</strong> Para mejorar la interpretación de sus mensajes 
              y personalizar las respuestas mediante inteligencia artificial. Los datos se procesan de forma 
              anonimizada cuando es posible.</li>
              <li><strong>Amazon Web Services (AWS):</strong> Para alojar nuestros servicios computacionales y 
              almacenar datos de forma segura en infraestructura en la nube.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              <strong>No vendemos ni alquilamos sus datos personales a terceros con fines comerciales o publicitarios.</strong>
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">5. Almacenamiento y Seguridad</h2>
            <p className="mb-4 leading-relaxed">
              Sus datos personales se almacenan en bases de datos PostgreSQL gestionadas con medidas de seguridad 
              que incluyen:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Encriptación de datos en tránsito (HTTPS/TLS).</li>
              <li>Acceso restringido a personal autorizado.</li>
              <li>Copias de seguridad periódicas.</li>
              <li>Monitoreo de accesos y actividad sospechosa.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              Conservamos sus datos mientras mantenga una cuenta activa con nosotros o mientras sea necesario 
              para prestarle nuestros servicios. Puede solicitar la eliminación de sus datos en cualquier momento.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">6. Sus Derechos</h2>
            <p className="mb-4 leading-relaxed">
              De acuerdo con la Ley 1581 de 2012, usted tiene derecho a:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Conocer:</strong> Acceder a sus datos personales que tenemos almacenados.</li>
              <li><strong>Actualizar:</strong> Corregir datos inexactos o incompletos.</li>
              <li><strong>Rectificar:</strong> Modificar información que sea errónea.</li>
              <li><strong>Suprimir:</strong> Solicitar la eliminación de sus datos cuando ya no sean necesarios.</li>
              <li><strong>Revocar:</strong> Retirar el consentimiento otorgado para el tratamiento de sus datos.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              Para ejercer estos derechos, puede contactarnos a través de:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Correo electrónico: <a href="mailto:Contacto@almia.com.co" className="text-[#9054C6] hover:underline">Contacto@almia.com.co</a></li>
              <li>WhatsApp: <a href="https://wa.me/573135064977" className="text-[#9054C6] hover:underline">+57 (313) 506-4977</a></li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">7. Consentimiento</h2>
            <p className="mb-4 leading-relaxed">
              Al utilizar nuestro servicio CIO y proporcionar sus datos personales a través de WhatsApp, 
              usted acepta expresamente esta Política de Privacidad y autoriza el tratamiento de sus datos 
              para las finalidades aquí descritas.
            </p>
            <p className="mb-4 leading-relaxed">
              Durante el proceso de registro en CIO, le solicitaremos su consentimiento explícito antes de 
              recopilar cualquier información personal.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">8. Menores de Edad</h2>
            <p className="mb-4 leading-relaxed">
              Nuestros servicios están dirigidos a personas mayores de 18 años. No recopilamos 
              intencionalmente datos de menores de edad. Si detectamos que hemos recopilado datos 
              de un menor, procederemos a eliminarlos de inmediato.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">9. Cambios a esta Política</h2>
            <p className="mb-4 leading-relaxed">
              Nos reservamos el derecho de actualizar esta Política de Privacidad en cualquier momento. 
              Los cambios serán publicados en esta página con la fecha de actualización correspondiente. 
              Le notificaremos sobre cambios significativos a través de WhatsApp.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">10. Contacto</h2>
            <p className="mb-4 leading-relaxed">
              Si tiene preguntas sobre esta Política de Privacidad o sobre el tratamiento de sus datos 
              personales, puede contactarnos:
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

