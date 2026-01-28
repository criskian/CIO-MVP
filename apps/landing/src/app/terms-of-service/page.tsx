import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Términos de Servicio - CIO by Almia',
  description: 'Términos y condiciones de uso del servicio CIO - Cazador Inteligente de Oportunidades',
};

export default function TermsOfService() {
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
          Términos de Servicio
        </h1>
        <p className="text-gray-500 mb-8">Última actualización: 28 de enero de 2026</p>

        <div className="prose prose-lg max-w-none text-[#2C2C2C]">
          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">1. Aceptación de los Términos</h2>
            <p className="mb-4 leading-relaxed">
              Al acceder y utilizar <strong>CIO - Cazador Inteligente de Oportunidades</strong> (en adelante "CIO" o "el Servicio"),
              operado por <strong>Almia Consulting SAS</strong> (en adelante "Almia", "nosotros" o "la Empresa"),
              usted acepta estar sujeto a estos Términos de Servicio y a nuestra{' '}
              <Link href="/privacy-policy" className="text-[#9054C6] hover:underline font-medium">Política de Privacidad</Link>,
              la cual forma parte integral de este contrato.
            </p>
            <p className="mb-4 leading-relaxed">
              Si no está de acuerdo con alguno de estos términos, le solicitamos que no utilice nuestro servicio.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">2. Descripción del Servicio</h2>
            <p className="mb-4 leading-relaxed">
              CIO es un asistente conversacional de WhatsApp que ayuda a los usuarios a encontrar
              oportunidades de empleo de forma automatizada:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Creación de un perfil de búsqueda de empleo personalizado.</li>
              <li>Búsquedas automatizadas de ofertas de empleo basadas en sus preferencias.</li>
              <li>Envío de alertas según la configuración del usuario con ofertas de empleo relevantes.</li>
              <li>Procesamiento opcional de hojas de vida (CV) para mejorar las recomendaciones.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">3. Planes del Servicio, Gratuidad y Elegibilidad</h2>

            <h3 className="text-lg font-semibold text-[#2C2C2C] mb-3">Elegibilidad:</h3>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Debe ser mayor de 16 años (16-18 con autorización de padres o representante legal).</li>
              <li>Tener una cuenta activa de WhatsApp.</li>
              <li>Proporcionar información veraz y actualizada.</li>
              <li>Aceptar nuestra Política de Privacidad y estos Términos de Servicio.</li>
            </ul>

            <h3 className="text-lg font-semibold text-[#2C2C2C] mb-3">Planes de CIO:</h3>

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
                <li>Alertas de empleo según sus preferencias.</li>
                <li>Suscripción mensual activa.</li>
              </ul>
            </div>

            <p className="mb-4 leading-relaxed">
              La contratación del Plan Premium requiere consentimiento explícito de pago y puede cancelarse en cualquier momento.
            </p>

            <h3 className="text-lg font-semibold text-[#2C2C2C] mb-3">Consentimiento de uso y tratamiento de datos:</h3>
            <p className="mb-2 leading-relaxed">Al seleccionar "Acepto", usted confirma que:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Tiene 16 años o más (16-18 con autorización de padres o representante legal).</li>
              <li>Ha leído y acepta estos Términos de Servicio y la Política de Privacidad.</li>
              <li>Autoriza el tratamiento de sus datos personales conforme a la Ley 1581 de 2012 y demás normativa aplicable.</li>
              <li>Entiende que puede ejercer sus derechos ARCO (Acceso, Rectificación, Cancelación y Oposición) y revocar su consentimiento en cualquier momento contactando a Almia.</li>
            </ul>

            <h3 className="text-lg font-semibold text-[#2C2C2C] mb-3">Cambios en planes o condiciones:</h3>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Cualquier cambio en planes, beneficios o condiciones de uso será notificado previamente antes de su implementación.</li>
              <li>La continuidad en el uso del servicio después de estos cambios implica aceptación de los nuevos términos.</li>
            </ul>

            <h3 className="text-lg font-semibold text-[#2C2C2C] mb-3">Protección de menores:</h3>
            <p className="mb-4 leading-relaxed">
              Si detectamos datos de un menor de 16 años sin autorización, procederemos a su eliminación inmediata.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">4. Uso del Servicio</h2>
            <p className="mb-4 leading-relaxed">
              Al utilizar CIO, usted se compromete a:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Usar el servicio únicamente para fines de búsqueda de empleo legítima.</li>
              <li>Proporcionar información veraz y actualizada.</li>
              <li>No utilizar el servicio para actividades ilegales o no autorizadas.</li>
              <li>No intentar acceder a sistemas o datos de otros usuarios.</li>
              <li>No enviar spam, contenido ofensivo o malicioso.</li>
              <li>No intentar eludir medidas de seguridad del servicio.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">5. Fuentes de Información y Terceros</h2>
            <p className="mb-4 leading-relaxed">
              CIO obtiene las ofertas de empleo a través de SerpAPI y otros proveedores que procesan información pública.
            </p>
            <p className="mb-4 leading-relaxed">
              Algunos datos pueden ser procesados por terceros (WhatsApp Business API, AWS) siguiendo estándares de seguridad
              y anonimización cuando sea posible.
            </p>
            <p className="mb-4 leading-relaxed">
              Los usuarios son informados sobre cualquier tratamiento de datos por terceros y de posibles transferencias internacionales de datos.
            </p>
            <p className="mb-2 leading-relaxed font-semibold">Importante:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Almia no es responsable de la exactitud o vigencia de las ofertas publicadas por terceros.</li>
              <li>Se recomienda verificar la información directamente con el empleador antes de aplicar.</li>
              <li>CIO no garantiza la obtención de empleo como resultado del uso del servicio.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">6. Propiedad Intelectual</h2>
            <p className="mb-4 leading-relaxed">
              Todo el contenido, diseño, código, marcas, logos y materiales relacionados con CIO y Almia son propiedad
              exclusiva de Almia o sus licenciantes, protegidos por leyes de propiedad intelectual nacionales e internacionales.
            </p>
            <p className="mb-4 leading-relaxed">
              No puede copiar, modificar, distribuir, vender o arrendar ninguna parte del servicio sin consentimiento
              previo por escrito de Almia.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">7. Limitación de Responsabilidad</h2>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>El servicio se proporciona "tal cual" y "según disponibilidad", sin garantías expresas o implícitas.</li>
              <li>Almia no garantiza que el servicio será ininterrumpido, seguro o libre de errores.</li>
              <li>Almia no será responsable por daños indirectos, incidentales, especiales, consecuentes o punitivos derivados del uso del servicio.</li>
              <li>Las limitaciones anteriores no afectan derechos irrenunciables del usuario según la legislación colombiana.</li>
              <li>Almia no es responsable de decisiones laborales basadas en la información proporcionada por el servicio.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">8. Indemnización</h2>
            <p className="mb-4 leading-relaxed">
              Usted acepta indemnizar y mantener indemne a Almia, sus directores, empleados y agentes de cualquier
              reclamación, pérdida, daño, costo o gasto (incluyendo honorarios de abogados) derivado de su uso del
              servicio o incumplimiento de estos Términos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">9. Suspensión y Terminación</h2>
            <p className="mb-4 leading-relaxed">
              Almia se reserva el derecho de suspender o terminar su acceso al servicio en cualquier momento,
              con o sin causa, y con o sin previo aviso, si:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Viola estos Términos de Servicio.</li>
              <li>Utiliza el servicio de manera fraudulenta o abusiva.</li>
              <li>Su conducta afecta negativamente a otros usuarios o al funcionamiento del servicio.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              Usted puede dejar de usar el servicio solicitando la eliminación de su cuenta a través de CIO
              o contactando directamente a Almia.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">10. Modificaciones</h2>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Almia puede modificar estos Términos de Servicio en cualquier momento.</li>
              <li>Los cambios entrarán en vigor inmediatamente después de su publicación en esta página.</li>
              <li>Notificaremos cambios significativos mediante correo electrónico o WhatsApp, especialmente si afectan la Política de Privacidad o el tratamiento de datos personales.</li>
              <li>El uso continuado del servicio constituye aceptación de los nuevos términos.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">11. Ley Aplicable y Jurisdicción</h2>
            <p className="mb-4 leading-relaxed">
              Estos Términos se rigen por las leyes de la República de Colombia.
            </p>
            <p className="mb-4 leading-relaxed">
              Cualquier disputa será sometida a los tribunales competentes de Cali, Colombia.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">12. Divisibilidad</h2>
            <p className="mb-4 leading-relaxed">
              Si alguna disposición de estos Términos se considera inválida o inaplicable, las demás
              disposiciones continuarán en pleno vigor y efecto.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">13. Contacto</h2>
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
