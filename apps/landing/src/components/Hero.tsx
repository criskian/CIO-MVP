import Image from 'next/image';

interface HeroProps {
  whatsappLink: string;
}

export default function Hero({ whatsappLink }: HeroProps) {
  return (
    <section className="min-h-screen flex flex-col bg-white relative overflow-hidden">
      {/* Logo Almia en la parte superior */}
      <div className="w-full pt-16 md:pt-15 px-4 relative z-10">
        <Image
          src="/assets/images/logoAlmia.png"
          alt="Almia Logo"
          width={110}
          height={35}
          className="mx-auto"
          priority
        />
        {/* Texto "cazador inteligente de oportunidades" */}
        <p className="text-center mt-3 text-[#9054C6] font-medium text-base md:text-lg">
          Cazador inteligente de oportunidades
        </p>
      </div>

      {/* Rectángulo con gradiente multicolor que se desvanece hacia arriba */}
      <div className="absolute inset-x-0 bottom-0 h-[500px] md:h-[600px] lg:h-[650px]">
        {/* Gradiente de colores base */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, #73439E 0%, #9054C6 25%, #FFE11E 50%, #3BC8B8 75%, #2FA093 100%)',
          }}
        ></div>
        {/* Overlay de desvanecimiento blanco (de opaco arriba a transparente abajo) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, #FFFFFF 0%, rgba(248, 248, 248, 0.96) 28%, rgba(248, 248, 248, 0.72) 50%, rgba(248, 248, 248, 0.5) 72%, rgba(248, 248, 248, 0) 100%)',
          }}
        ></div>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 pt-44 pb-12">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Tarjetas con logos laterales */}
          <div className="hidden lg:block">
            {/* Columna izquierda */}
            <div
              className="absolute flex flex-col gap-14"
              style={{ top: '-140px', left: '-310px' }}
            >
              <div
                className="group flex items-center justify-center cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:scale-110"
                style={{
                  width: '120px',
                  height: '120px',
                  backgroundColor: '#F8F8F8',
                  borderRadius: '18px',
                  padding: '12px',
                  boxShadow: '0px 4px 40px rgba(100, 99, 99, 0.3)',
                  transform: 'rotate(-12deg)',
                }}
              >
                <Image
                  src="/assets/images/MagnetoLogo.jpg"
                  alt="Magneto"
                  width={108}
                  height={108}
                  style={{ objectFit: 'cover', borderRadius: '18px' }}
                  className="transition-transform duration-300 group-hover:scale-105"
                />
              </div>

              <div
                className="group flex items-center justify-center mx-auto cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:scale-110"
                style={{
                  width: '86px',
                  height: '86px',
                  backgroundColor: '#F8F8F8',
                  borderRadius: '18px',
                  padding: '10px',
                  boxShadow: '0px 4px 40px rgba(100, 99, 99, 0.3)',
                  transform: 'rotate(-14deg)',
                  marginLeft: '100px',
                }}
              >
                <Image
                  src="/assets/images/indeeedlogo.png"
                  alt="Indeed"
                  width={86}
                  height={86}
                  style={{ objectFit: 'cover', borderRadius: '18px' }}
                  className="transition-transform duration-300 group-hover:scale-105"
                />
              </div>

              <div
                className="group flex items-center justify-center cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:scale-110"
                style={{
                  width: '120px',
                  height: '120px',
                  backgroundColor: '#F8F8F8',
                  borderRadius: '18px',
                  padding: '12px',
                  boxShadow: '0px 4px 40px rgba(100, 99, 99, 0.3)',
                  transform: 'rotate(10deg)',
                }}
              >
                <Image
                  src="/assets/images/computrabajoLogo.png"
                  alt="Computrabajo"
                  width={108}
                  height={108}
                  style={{ objectFit: 'contain' }}
                  className="transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            </div>

            {/* Columna derecha */}
            <div
              className="absolute flex flex-col gap-14 items-end"
              style={{ top: '-120px', right: '-310px' }}
            >
              <div
                className="group flex items-center justify-center cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:scale-110"
                style={{
                  width: '120px',
                  height: '120px',
                  backgroundColor: '#F8F8F8',
                  borderRadius: '18px',
                  padding: '12px',
                  boxShadow: '0px 4px 40px rgba(100, 99, 99, 0.3)',
                  transform: 'rotate(12deg)',
                }}
              >
                <Image
                  src="/assets/images/linkedin.png"
                  alt="LinkedIn"
                  width={108}
                  height={108}
                  style={{ objectFit: 'contain' }}
                  className="transition-transform duration-300 group-hover:scale-105"
                />
              </div>

              <div
                className="group flex items-center justify-center mr-6 cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:scale-110"
                style={{
                  width: '86px',
                  height: '86px',
                  backgroundColor: '#F8F8F8',
                  borderRadius: '18px',
                  padding: '10px',
                  boxShadow: '0px 4px 40px rgba(100, 99, 99, 0.3)',
                  transform: 'rotate(-14deg)',
                  marginRight: '100px',
                }}
              >
                <Image
                  src="/assets/images/elempleoLogo.png"
                  alt="Elempleo"
                  width={72}
                  height={72}
                  style={{ objectFit: 'contain' }}
                  className="transition-transform duration-300 group-hover:scale-105"
                />
              </div>

              <div
                className="group flex items-center justify-center cursor-pointer transition-all duration-300 hover:-translate-y-2 hover:scale-110"
                style={{
                  width: '120px',
                  height: '120px',
                  backgroundColor: '#F8F8F8',
                  borderRadius: '18px',
                  padding: '12px',
                  boxShadow: '0px 4px 40px rgba(100, 99, 99, 0.3)',
                  transform: 'rotate(10deg)',
                }}
              >
                <Image
                  src="/assets/images/GoogleLogo.png"
                  alt="Google Jobs"
                  width={108}
                  height={108}
                  style={{ objectFit: 'contain' }}
                  className="transition-transform duration-300 group-hover:scale-105"
                />
              </div>
            </div>
          </div>
 

        {/* Texto Superior */}
        <p className="text-lg md:text-xl text-[#646363] font-normal mb-5">
          El cazador de ofertas de empleo más grande de Colombia
        </p>

        {/* Título Principal */}
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-medium text-black mb-6 max-w-3xl mx-auto" style={{ lineHeight: '1.4' }}>
          Encuentra empleo sin perder tanto{' '}
          <span className="font-bold text-[#9054C6]">tiempo</span> buscando.
        </h1>

        {/* Empieza aquí */}
        <p className="text-lg md:text-xl text-[#A6A6A6] font-normal mb-5">
        Todas las ofertas de internet, filtradas y enviadas directo a tu WhatsApp.
        </p>

        {/* Botón WhatsApp */}
        <div className="flex justify-center">
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-3 px-8 py-3 border-2 border-[#25D366] text-[#25D366] font-medium rounded-lg text-base hover:bg-green-50 transition-all duration-300"
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
            <span>Whatsapp</span>
          </a>
        </div>
        </div>
      </div>

      {/* Cuadro de Estadísticas */}
      <div className="w-full px-4 pb-8 relative z-10">
        <div className="mx-auto" style={{ maxWidth: '1470px' }}>
          {/* Rectángulo exterior transparente con sombra */}
          <div
            className="w-full rounded-3xl relative flex items-center justify-center"
            style={{
              minHeight: '147px',
              boxShadow: '0px 4px 8px 0px rgba(255, 255, 255, 0.57)',
              padding: '17.5px 2.04%', // 30.5px / 1498px ≈ 2.04% en cada lado
            }}
          >
            {/* Rectángulo interior con fondo blanco semi-transparente */}
            <div
              className="w-full min-h-[112px] rounded-2xl flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8 px-6 md:px-12 py-4 md:py-0"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.73)',
              }}
            >
              {/* Estadística 1 */}
              <div className="flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 flex-1 text-center md:text-left">
                <span className="text-2xl md:text-4xl font-medium text-[#A6A6A6] whitespace-nowrap">
                  +20
                </span>
                <span className="text-sm md:text-base font-normal text-[#A6A6A6] text-center md:text-left">
                  plataformas de empleo analizadas.
                </span>
              </div>

              {/* Estadística 2 */}
              <div className="flex items-center justify-center gap-2 flex-1 flex-wrap md:flex-nowrap">
                <span className="text-2xl md:text-4xl font-medium text-[#A6A6A6] whitespace-nowrap">
                  +5.000
                </span>
                <span className="text-sm md:text-base font-normal text-[#A6A6A6] text-center md:text-left">
                  Nuevas vacantes aparecen cada día en Latinoamérica.
                </span>
              </div>

              {/* Estadística 3 */}
              <div className="flex items-center justify-center gap-2 flex-1 flex-wrap md:flex-nowrap">
                <span className="text-2xl md:text-4xl font-medium text-[#A6A6A6] whitespace-nowrap">
                  90%
                </span>
                <span className="text-sm md:text-base font-normal text-[#A6A6A6] text-center md:text-left">
                  De las personas no aplica al empleo adecuado.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
