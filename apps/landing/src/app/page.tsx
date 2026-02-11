import Hero from '@/components/Hero';
import Testimonials from '@/components/Testimonials';
import WhatIsCIO from '@/components/WhatIsCIO';
import Benefits from '@/components/Benefits';
import HowItWorks from '@/components/HowItWorks';
import Footer from '@/components/Footer';

export default function Home() {
  // Obtener número de WhatsApp desde variables de entorno
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '573001234567';
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    'Hola CIO, quiero buscar trabajo',
  )}`;

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <Hero whatsappLink={whatsappLink} />

      {/* Testimonials Section */}
      <Testimonials />

      {/* What is CIO Section */}
      <WhatIsCIO />

      {/* How It Works Section */}
      <HowItWorks whatsappLink={whatsappLink} />

      {/* Benefits Section */}
      <Benefits whatsappLink={whatsappLink} />

      {/* Footer */}
      <Footer />
    </main>
  );
}
