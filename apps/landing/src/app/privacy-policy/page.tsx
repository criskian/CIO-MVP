import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Política de Privacidad - CIO by Almia',
  description: 'Política de privacidad y tratamiento de datos personales de CIO - Cazador Inteligente de Oportunidades',
};

export default function PrivacyPolicy() {
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
        <p className="text-gray-500 mb-8">Última actualización: 28 de enero de 2026</p>

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
              <li><strong>Hoja de vida (CV):</strong> Si decide compartirla voluntariamente, para mejorar la personalización de las búsquedas.</li>
              <li><strong>Historial de conversación:</strong> Mensajes intercambiados con nuestro asistente para mejorar el servicio.</li>
              <li><strong>Historial de ofertas enviadas:</strong> Para evitar enviarle ofertas duplicadas.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">3. Finalidad del Tratamiento</h2>
            <p className="mb-4 leading-relaxed">
              Utilizamos sus datos personales para:
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
              Para prestar nuestros servicios, compartimos ciertos datos con los siguientes proveedores:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Meta (WhatsApp Business API):</strong> Para la comunicación a través de WhatsApp.
                Meta procesa los mensajes según su política de privacidad.</li>
              <li><strong>SerpAPI:</strong> Para realizar búsquedas de ofertas de empleo en múltiples portales;
                solo enviamos criterios de búsqueda (rol, ubicación), no datos personales identificables.</li>
              <li><strong>AWS Bedrock y AWS:</strong> Para mejorar la interpretación de mensajes mediante IA
                y almacenamiento seguro. Los datos se procesan de forma anonimizada cuando es posible.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              <strong>No vendemos ni alquilamos sus datos personales a terceros con fines comerciales o publicitarios.</strong>
            </p>
            <p className="mb-4 leading-relaxed text-gray-600 italic">
              Nota: Algunos proveedores pueden procesar datos fuera de Colombia; aplican medidas equivalentes
              de seguridad de acuerdo con normas internacionales.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">5. Almacenamiento y Seguridad</h2>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Encriptación de datos en tránsito (HTTPS/TLS).</li>
              <li>Acceso restringido a personal autorizado.</li>
              <li>Copias de seguridad periódicas.</li>
              <li>Monitoreo de accesos y actividad sospechosa.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              Conservamos sus datos mientras mantenga una cuenta activa o mientras sean necesarios para
              prestarle nuestros servicios. Usted puede solicitar la eliminación de sus datos en cualquier
              momento a través de correo electrónico o WhatsApp.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">6. Sus Derechos (ARCO y Portabilidad)</h2>
            <p className="mb-4 leading-relaxed">
              De acuerdo con la Ley 1581 de 2012, usted tiene derecho a:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>Conocer:</strong> Acceder a sus datos personales.</li>
              <li><strong>Actualizar/Rectificar:</strong> Corregir o modificar datos inexactos o incompletos.</li>
              <li><strong>Suprimir:</strong> Solicitar la eliminación de sus datos cuando ya no sean necesarios.</li>
              <li><strong>Revocar:</strong> Retirar el consentimiento otorgado para el tratamiento de sus datos.</li>
              <li><strong>Portabilidad:</strong> Solicitar que sus datos sean transferidos a otro responsable, cuando sea posible.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              Para ejercer estos derechos, puede contactarnos en:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Correo electrónico: <a href="mailto:Contacto@almia.com.co" className="text-[#9054C6] hover:underline">Contacto@almia.com.co</a></li>
              <li>WhatsApp: <a href="https://wa.me/573135064977" className="text-[#9054C6] hover:underline">+57 (313) 506-4977</a></li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">7. Consentimiento y Planes del Servicio</h2>
            <p className="mb-4 leading-relaxed">
              Al utilizar nuestro servicio CIO y proporcionar sus datos personales a través de WhatsApp,
              usted acepta expresamente esta Política de Privacidad y autoriza el tratamiento de sus datos
              para las finalidades aquí descritas. Durante el proceso de registro en CIO, le solicitaremos
              su consentimiento explícito antes de recopilar cualquier información personal.
            </p>
            <p className="mb-4 leading-relaxed font-semibold">
              CIO cuenta actualmente con dos planes de servicio:
            </p>
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <p className="font-bold text-[#9054C6] mb-2">Plan Free:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Acceso a 3 búsquedas personalizadas GRATIS.</li>
                <li>Válido por 3 días desde el registro.</li>
                <li>Alertas de empleo según sus preferencias.</li>
              </ul>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <p className="font-bold text-[#9054C6] mb-2">Plan Premium:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>5 búsquedas a la semana.</li>
                <li>Suscripción mensual.</li>
              </ul>
            </div>
            <p className="mb-4 leading-relaxed">
              Cualquier cambio en los planes, condiciones o beneficios será debidamente informado a los usuarios
              antes de su implementación, asegurando que siempre cuente con la información necesaria para decidir
              sobre su uso del servicio.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">8. Menores de Edad</h2>
            <p className="mb-4 leading-relaxed">
              Nuestros servicios están dirigidos a personas mayores de 16 años (16-18 con autorización de
              padres o representante legal). No recopilamos intencionalmente datos de menores de edad.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">9. Cambios a esta Política</h2>
            <p className="mb-4 leading-relaxed">
              Nos reservamos el derecho de actualizar esta Política en cualquier momento. Los cambios se
              publicarán en esta página y se notificarán a los usuarios activos mediante correo electrónico o WhatsApp.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">10. Contacto</h2>
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
