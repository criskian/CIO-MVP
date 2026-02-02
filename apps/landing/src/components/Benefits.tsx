'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import RegistrationModal from './RegistrationModal';

interface BenefitsProps {
  whatsappLink: string;
}

type Currency = 'COP' | 'USD' | 'MXN';

interface PriceData {
  premium: { amount: string; period: string };
  pro: { amount: string; period: string };
}

const prices: Record<Currency, PriceData> = {
  COP: {
    premium: { amount: '$20.000', period: '/ mes' },
    pro: { amount: '$54.000', period: '/ 3 meses' },
  },
  USD: {
    premium: { amount: '$6', period: '/ mes' },
    pro: { amount: '$15', period: '/ 3 meses' },
  },
  MXN: {
    premium: { amount: '$95', period: '/ mes' },
    pro: { amount: '$257', period: '/ 3 meses' },
  },
};

const currencyFlags: Record<Currency, string> = {
  COP: '🇨🇴',
  USD: '🇺🇸',
  MXN: '🇲🇽',
};

export default function Benefits({ whatsappLink }: BenefitsProps) {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currency, setCurrency] = useState<Currency>('COP');

  useEffect(() => {
    const checkDesktop = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    checkDesktop();
    window.addEventListener('resize', checkDesktop);
    return () => window.removeEventListener('resize', checkDesktop);
  }, []);

  const handleCTAClick = () => {
    setIsModalOpen(true);
  };

  return (
    <section className="-mt-6 md:-mt-0 lg:-mt-[240px] pb-32 lg:pb-0 px-6 md:px-4 bg-white overflow-hidden">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">

          {/* Columna Izquierda: Imagen de personas - oculta en móvil */}
          <div className="hidden lg:flex w-full lg:w-1/2 justify-center lg:justify-start">
            <div
              className="relative w-full max-w-[640px]"
              style={{ transform: 'scaleX(-1) translateY(100px)' }}
            >
              <Image
                src="/images/personas-mockup.png"
                alt="Personas usando CIO"
                width={600}
                height={700}
                className="w-full h-auto object-contain"
                priority
              />
            </div>
          </div>

          {/* Columna Derecha: Contenido */}
          <div className="w-full lg:w-1/2 flex flex-col gap-6 mt-10 lg:mt-[180px] lg:scale-[0.9] lg:origin-top-left items-center lg:items-start">

            {/* Cuadro morado con overlay/borde */}
            <div className="relative w-[85%] max-w-[500px] lg:max-w-none lg:ml-[-210px]" style={isDesktop ? { width: 'calc(100% + 215px)' } : {}}>
              {/* Marco exterior - versión móvil */}
              <div className="lg:hidden absolute rounded-[16px] border-[1px] border-[#9054C6] border-solid" style={{ top: '-12px', bottom: '-12px', left: '-12px', right: '-12px' }} />
              {/* Marco exterior - versión desktop */}
              <div className="hidden lg:block absolute rounded-[20px] border-[1px] border-[#9054C6] border-solid" style={{ top: '-18px', bottom: '-18px', left: '-18px', right: '-18px' }} />

              {/* Cuadro morado interior */}
              <div
                className="relative bg-[#9054C6] rounded-[20px] px-5 py-6 md:px-7 md:py-4 lg:px-8 xl:px-9"
                style={{
                  zIndex: 2,
                }}
              >
                <p
                  className="text-[#F8F8F8] font-poppins text-center leading-relaxed text-[15px] md:text-[19px] lg:text-[20px] xl:text-[23px] font-normal"
                >
                  Encontrar trabajo no es suerte, es estrategia.
                  <br />
                  CIO detecta las oportunidades; Almia te prepara para ser el mejor candidato.
                </p>
              </div>
            </div>

            {/* Sección de Beneficios */}
            <div className="mt-1 md:mt-3 text-center lg:text-left lg:ml-[-90px]" style={{ transform: isDesktop ? 'translateY(60px)' : 'translateY(50px)' }}>
              {/* Título */}
              <h2
                className="font-poppins font-bold text-[#2C2C2C] mb-2 md:mb-3 text-[26px] md:text-[34px] xl:text-[40px] leading-[1]"
                style={{ textShadow: '0px 2px 6px rgba(0, 0, 0, 0.28)' }}
              >
                Pruébalo ya
              </h2>

              {/* Texto con enlace */}
              <p
                className="font-poppins text-[#2C2C2C] text-[14px] md:text-[16px] xl:text-[18px] leading-relaxed font-normal mb-4"
                style={{ textShadow: '0px 2px 4px rgba(0, 0, 0, 0.18)' }}
              >
                ¿Qué esperas para encontrar tu nueva oportunidad laboral? Empieza tu búsqueda.
              </p>

              {/* Currency Selector */}
              <div className="flex flex-col items-center lg:items-start mb-4">
                <div className="inline-flex bg-gray-100 rounded-full p-1 gap-1">
                  {(['COP', 'USD', 'MXN'] as Currency[]).map((curr) => (
                    <button
                      key={curr}
                      onClick={() => setCurrency(curr)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center gap-1.5 ${currency === curr
                        ? 'bg-[#9054C6] text-white shadow-md'
                        : 'text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                      <span>{currencyFlags[curr]}</span>
                      <span>{curr}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  * Para dólar (USD) y peso mexicano (MXN) los precios son referenciales. El cargo final se muestra en la pasarela de pago.
                </p>
              </div>

              {/* Pricing Cards - 3 columns */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                {/* Plan Free */}
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-4 border border-gray-200 shadow-sm flex flex-col transition-all duration-300 hover:scale-105 hover:shadow-xl hover:border-[#9054C6]/50 cursor-pointer">
                  <div className="mb-2">
                    <h3 className="font-poppins font-bold text-[#2C2C2C] text-base">Plan Free</h3>
                  </div>
                  <p className="font-poppins text-[#9054C6] font-bold text-xl mb-3">
                    $0 <span className="text-xs font-normal text-gray-500">/ Una semana</span>
                  </p>
                  <ul className="space-y-1.5 text-xs text-gray-600 flex-grow">
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>1 semana cazando las mejores ofertas</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>Alertas de empleo diarias</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>Búsqueda personalizada según preferencias</span>
                    </li>
                  </ul>
                  <button
                    onClick={handleCTAClick}
                    className="mt-4 w-full py-2.5 bg-white border-2 border-[#9054C6] text-[#9054C6] font-poppins font-semibold rounded-lg hover:bg-[#9054C6] hover:text-white transition-all duration-300 text-sm"
                  >
                    Caza Ofertas ya!!
                  </button>
                  <p className="text-[10px] text-[#25D366] text-center mt-2 font-medium">
                    *1 semana gratis
                  </p>
                </div>

                {/* Plan Premium */}
                <div className="bg-gradient-to-br from-[#9054C6] to-[#7040A8] rounded-2xl p-4 border-2 border-[#B17DD9] shadow-lg relative overflow-hidden flex flex-col transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer">
                  <div className="mb-2">
                    <h3 className="font-poppins font-bold text-white text-base">Plan Premium</h3>
                  </div>
                  <p className="font-poppins text-white font-bold text-xl mb-3">
                    {prices[currency].premium.amount}{' '}
                    <span className="text-xs font-normal text-white/70">{prices[currency].premium.period}</span>
                  </p>
                  <ul className="space-y-1.5 text-xs text-white/90 flex-grow">
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>1 mes cazando las mejores ofertas</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>Alertas de empleo diarias</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>Búsqueda personalizada según rol</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>Soporte de mentor Almia para ajustar tu búsqueda</span>
                    </li>
                  </ul>
                  <button
                    onClick={handleCTAClick}
                    className="mt-4 w-full py-2.5 bg-white text-[#9054C6] font-poppins font-semibold rounded-lg hover:bg-gray-100 transition-all duration-300 text-sm"
                  >
                    Comenzar ahora
                  </button>
                </div>

                {/* Plan Pro */}
                <div className="bg-gradient-to-br from-[#646363] to-[#1a1a1a] rounded-2xl p-4 border-2 border-[#a6a6a6] shadow-lg relative overflow-hidden flex flex-col transition-all duration-300 hover:scale-105 hover:shadow-2xl cursor-pointer">
                  {/* Badge Descuento */}
                  <div className="absolute top-0 right-0 bg-[#25D366] text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">
                    -10%
                  </div>
                  <div className="mb-2">
                    <h3 className="font-poppins font-bold text-white text-base">Plan Pro</h3>
                  </div>
                  <p className="font-poppins text-white font-bold text-xl mb-3">
                    {prices[currency].pro.amount}{' '}
                    <span className="text-xs font-normal text-gray-400">{prices[currency].pro.period}</span>
                  </p>
                  <ul className="space-y-1.5 text-xs text-gray-300 flex-grow">
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>3 meses cazando las mejores ofertas</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>Alertas de empleo diarias</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>Búsqueda personalizada según rol</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#25D366] mt-0.5">✓</span>
                      <span>Soporte de mentor Almia</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-[#9054C6] mt-0.5">★</span>
                      <span>Acceso a GPT Almia Career Advisor para ajustar tu CV</span>
                    </li>
                  </ul>
                  <button
                    onClick={handleCTAClick}
                    className="mt-4 w-full py-2.5 bg-white text-[#2c2c2c] font-poppins font-semibold rounded-lg hover:bg-[#e6e6e6] transition-all duration-300 text-sm"
                  >
                    Obtener Pro
                  </button>
                </div>
              </div>


            </div>
          </div>
        </div>
      </div>

      {/* Modal de Registro */}
      <RegistrationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </section>
  );
}
