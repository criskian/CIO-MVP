import Hero from '@/components/Hero';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import CTA from '@/components/CTA';
import Footer from '@/components/Footer';

export default function Home() {
  // Obtener número de WhatsApp desde variables de entorno
  const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '573001234567';
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
    'Hola CIO, quiero buscar trabajo',
  )}`;

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Hero Section */}
      <Hero whatsappLink={whatsappLink} />

      {/* Features Section */}
      <Features />

      {/* How It Works Section */}
      <HowItWorks />

      {/* CTA Section */}
      <CTA whatsappLink={whatsappLink} />

      {/* Footer */}
      <Footer />
    </main>
  );
}
