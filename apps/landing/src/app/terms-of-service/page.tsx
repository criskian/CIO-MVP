import Image from 'next/image';
import Link from 'next/link';

export const metadata = {
  title: 'Términos de Servicio - CIO by Almia',
  description: 'Términos y condiciones de uso del servicio CIO - Cazador Inteligente de Oportunidades',
};

export default function TermsOfService() {
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
          Términos de Servicio
        </h1>
        <p className="text-gray-500 mb-8">Última actualización: {currentDate}</p>

        <div className="prose prose-lg max-w-none text-[#2C2C2C]">
          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">1. Aceptación de los Términos</h2>
            <p className="mb-4 leading-relaxed">
              Al acceder y utilizar el servicio <strong>CIO - Cazador Inteligente de Oportunidades</strong> 
              (en adelante "CIO" o "el Servicio"), operado por <strong>Almia Consulting SAS</strong> 
              (en adelante "Almia", "nosotros" o "la Empresa"), usted acepta estar sujeto a estos 
              Términos de Servicio.
            </p>
            <p className="mb-4 leading-relaxed">
              Si no está de acuerdo con alguno de estos términos, le solicitamos que no utilice nuestro servicio.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">2. Descripción del Servicio</h2>
            <p className="mb-4 leading-relaxed">
              CIO es un asistente conversacional de WhatsApp que ayuda a los usuarios a encontrar 
              oportunidades de empleo de forma automatizada. El servicio incluye:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Creación de un perfil de búsqueda de empleo personalizado.</li>
              <li>Búsquedas automatizadas de ofertas de empleo basadas en sus preferencias.</li>
              <li>Envío de alertas diarias con ofertas de empleo relevantes.</li>
              <li>Procesamiento opcional de hojas de vida (CV) para mejorar las recomendaciones.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">3. Elegibilidad</h2>
            <p className="mb-4 leading-relaxed">
              Para utilizar CIO, usted debe:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Ser mayor de 18 años.</li>
              <li>Tener una cuenta activa de WhatsApp.</li>
              <li>Proporcionar información veraz y actualizada.</li>
              <li>Aceptar nuestra Política de Privacidad.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">4. Uso del Servicio</h2>
            <p className="mb-4 leading-relaxed">
              Al utilizar CIO, usted se compromete a:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Usar el servicio únicamente para fines de búsqueda de empleo legítima.</li>
              <li>No proporcionar información falsa o engañosa.</li>
              <li>No utilizar el servicio para actividades ilegales o no autorizadas.</li>
              <li>No intentar acceder a sistemas o datos de otros usuarios.</li>
              <li>No enviar spam, contenido ofensivo o malicioso a través del servicio.</li>
              <li>No intentar eludir las medidas de seguridad del servicio.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">5. Fuentes de Información de Empleo</h2>
            <p className="mb-4 leading-relaxed">
              CIO obtiene las ofertas de empleo a través de SerpAPI, un servicio que indexa información 
              públicamente disponible de diversos portales de empleo y sitios web de empresas.
            </p>
            <p className="mb-4 leading-relaxed">
              <strong>Importante:</strong>
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Almia no es responsable de la exactitud, vigencia o veracidad de las ofertas de empleo 
              mostradas, ya que provienen de fuentes externas.</li>
              <li>Las ofertas de empleo pertenecen a las empresas que las publican, no a Almia.</li>
              <li>Le recomendamos verificar siempre la información directamente con el empleador antes 
              de aplicar a cualquier oferta.</li>
              <li>CIO no garantiza que usted obtendrá empleo como resultado del uso del servicio.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">6. Gratuidad del Servicio</h2>
            <p className="mb-4 leading-relaxed">
              Actualmente, CIO es un servicio gratuito. Nos reservamos el derecho de introducir 
              funcionalidades premium o de pago en el futuro, las cuales serán claramente identificadas 
              y requerirán su consentimiento explícito antes de cualquier cargo.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">7. Propiedad Intelectual</h2>
            <p className="mb-4 leading-relaxed">
              Todo el contenido, diseño, código, marcas, logos y materiales relacionados con CIO y Almia 
              son propiedad exclusiva de Almia Consulting SAS o de sus licenciantes, y están protegidos 
              por las leyes de propiedad intelectual de Colombia y tratados internacionales.
            </p>
            <p className="mb-4 leading-relaxed">
              Usted no puede copiar, modificar, distribuir, vender o arrendar ninguna parte del servicio 
              sin nuestro consentimiento previo por escrito.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">8. Limitación de Responsabilidad</h2>
            <p className="mb-4 leading-relaxed">
              En la máxima medida permitida por la ley:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>El servicio se proporciona "tal cual" y "según disponibilidad", sin garantías de 
              ningún tipo, expresas o implícitas.</li>
              <li>Almia no garantiza que el servicio será ininterrumpido, seguro o libre de errores.</li>
              <li>Almia no será responsable por daños indirectos, incidentales, especiales, consecuentes 
              o punitivos derivados del uso del servicio.</li>
              <li>Almia no es responsable de las decisiones laborales que usted tome basándose en la 
              información proporcionada por el servicio.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">9. Indemnización</h2>
            <p className="mb-4 leading-relaxed">
              Usted acepta indemnizar y mantener indemne a Almia, sus directores, empleados y agentes, 
              de cualquier reclamación, pérdida, daño, costo o gasto (incluyendo honorarios de abogados) 
              que surja de su uso del servicio o de su incumplimiento de estos Términos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">10. Suspensión y Terminación</h2>
            <p className="mb-4 leading-relaxed">
              Nos reservamos el derecho de suspender o terminar su acceso al servicio en cualquier momento, 
              con o sin causa, y con o sin previo aviso, si:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Viola estos Términos de Servicio.</li>
              <li>Utiliza el servicio de manera fraudulenta o abusiva.</li>
              <li>Su conducta afecta negativamente a otros usuarios o al funcionamiento del servicio.</li>
            </ul>
            <p className="mb-4 leading-relaxed">
              Usted puede dejar de usar el servicio en cualquier momento enviando un mensaje a CIO 
              solicitando la eliminación de su cuenta, o contactándonos directamente.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">11. Modificaciones</h2>
            <p className="mb-4 leading-relaxed">
              Nos reservamos el derecho de modificar estos Términos de Servicio en cualquier momento. 
              Los cambios entrarán en vigor inmediatamente después de su publicación en esta página.
            </p>
            <p className="mb-4 leading-relaxed">
              Le notificaremos sobre cambios significativos a través de WhatsApp. El uso continuado 
              del servicio después de dichas modificaciones constituye su aceptación de los nuevos términos.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">12. Ley Aplicable y Jurisdicción</h2>
            <p className="mb-4 leading-relaxed">
              Estos Términos de Servicio se rigen por las leyes de la República de Colombia. 
              Cualquier disputa relacionada con estos términos o el uso del servicio será sometida 
              a la jurisdicción de los tribunales competentes de la ciudad de Cali, Colombia.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">13. Divisibilidad</h2>
            <p className="mb-4 leading-relaxed">
              Si alguna disposición de estos Términos se considera inválida o inaplicable, las demás 
              disposiciones continuarán en pleno vigor y efecto.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-bold text-[#9054C6] mb-4">14. Contacto</h2>
            <p className="mb-4 leading-relaxed">
              Si tiene preguntas sobre estos Términos de Servicio, puede contactarnos:
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

