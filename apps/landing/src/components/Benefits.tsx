import Image from 'next/image';

const benefitsList = [
  'Ofertas completamente personalizadas',
  'Ofertas completamente personalizadas',
  'Menos esfuerzo, más claridad',
  'Información precisa y verificada',
  'Accesible para todos',
  'Actualizaciones diarias',
];

export default function Benefits() {
  return (
    <section className="-mt-6 md:-mt-[220px] pb-32 lg:pb-0 px-4 bg-white overflow-hidden">
      <div className="max-w-[1440px] mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-8 lg:gap-16">
          
          {/* Columna Izquierda: Imagen de personas - oculta en móvil */}
          <div className="hidden lg:flex w-full lg:w-1/2 justify-center lg:justify-start">
            <div
              className="relative w-full max-w-[620px]"
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
          <div className="w-full lg:w-1/2 flex flex-col gap-6 mt-10 lg:mt-44 lg:scale-[0.9] lg:origin-top-left items-center lg:items-start">
            
            {/* Cuadro morado con overlay/borde */}
            <div className="relative w-[90%] max-w-[500px] lg:max-w-none lg:ml-[-210px]" style={{ width: 'calc(100% + 215px)' }}>
              {/* Marco exterior - versión móvil */}
              <div className="lg:hidden absolute rounded-[16px] border-[1px] border-[#9054C6] border-solid" style={{ top: '-12px', bottom: '-12px', left: '-12px', right: '-12px' }} />
              {/* Marco exterior - versión desktop */}
              <div className="hidden lg:block absolute rounded-[20px] border-[1px] border-[#9054C6] border-solid" style={{ top: '-18px', bottom: '-18px', left: '-18px', right: '-18px' }} />
              
              {/* Cuadro morado interior */}
              <div 
                className="relative bg-[#9054C6] rounded-[20px] px-6 py-6 md:px-9 md:py-4"
                style={{
                  zIndex: 2,
                }}
              >
                <p 
                  className="text-[#F8F8F8] font-poppins text-center leading-relaxed text-[17px] md:text-[21px] xl:text-[23px] font-normal"
                >
                  Encontrar trabajo no es suerte, es estrategia.
                  <br />
                  CIO detecta las oportunidades; Almia te prepara para ser el mejor candidato.
                </p>
              </div>
            </div>

            {/* Sección de Beneficios */}
            <div className="mt-3 text-center lg:text-left lg:ml-[-90px]" style={{ transform: 'translateY(70px)' }}>
              {/* Título */}
              <h2 
                className="font-poppins font-bold text-[#2C2C2C] mb-3 text-[26px] md:text-[34px] xl:text-[40px] leading-[1]"
                style={{ textShadow: '0px 2px 6px rgba(0, 0, 0, 0.28)' }}
              >
                Beneficios
              </h2>
              <br />

              {/* Subtexto */}
              <p 
                className="font-poppins text-black mb-4 text-[12px] md:text-[14px] xl:text-[16px] leading-[1.4] font-normal"
                style={{ textShadow: '0px 2px 4px rgba(0, 0, 0, 0.18)' }}
              >
                Reciba oportunidades laborales personalizadas según su rol y experiencia.
                <br />
                CIO analiza su perfil y le envía vacantes directamente a su WhatsApp.
              </p>
              <br />

              {/* Lista de beneficios */}
              <ul className="space-y-0.5 flex flex-col items-center lg:items-start">
                {benefitsList.map((benefit, index) => (
                  <li 
                    key={index}
                    className="font-poppins text-[#2C2C2C] flex items-center gap-2 text-[12px] md:text-[14px] xl:text-[16px] font-normal"
                    style={{ textShadow: '0px 2px 3px rgba(0, 0, 0, 0.16)' }}
                  >
                    <span className="text-[#2C2C2C]">•</span>
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

