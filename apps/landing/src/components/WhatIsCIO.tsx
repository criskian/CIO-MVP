'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';

export default function WhatIsCIO() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Ruta del video - formato vertical
  const videoSrc = '/assets/videos/IMG_0453.mp4';

  // Intersection Observer para detectar cuando el video está visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            // Autoplay cuando entra en viewport
            if (videoRef.current && !isPlaying) {
              videoRef.current.play()
                .then(() => setIsPlaying(true))
                .catch((error) => {
                  console.log('Autoplay bloqueado:', error);
                });
            }
          } else {
            setIsInView(false);
            // Pausar cuando sale del viewport
            if (videoRef.current && isPlaying) {
              videoRef.current.pause();
              setIsPlaying(false);
            }
          }
        });
      },
      {
        threshold: 0.5, // 50% del video visible para activar
        rootMargin: '0px',
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [isPlaying]);

  const handlePlayClick = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play()
          .then(() => setIsPlaying(true))
          .catch((error) => console.log('Error al reproducir:', error));
      }
    }
  };

  return (
    <section className="pt-4 md:pt-8 pb-16 md:pb-24 xl:pb-8 px-6 md:px-8 lg:px-12 xl:px-8 bg-white relative overflow-hidden">
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Ícono de click izquierdo */}
        <div
          className="absolute hidden xl:block"
          style={{
            left: 'calc(50% - 370px)',
            bottom: '18%',
            width: 'clamp(65px, 8vw, 100px)',
            height: 'clamp(67px, 8.2vw, 103px)',
            transform: 'rotate(2deg)',
          }}
        >
          <Image
            src="/assets/vectors/click.svg"
            alt="Click icon"
            width={100}
            height={103}
            style={{ objectFit: 'contain', width: '100%', height: '100%' }}
          />
        </div>

        {/* Ícono de click derecho */}
        <div
          className="absolute hidden xl:block"
          style={{
            right: 'calc(50% - 370px)',
            top: '45%',
            width: 'clamp(65px, 8vw, 100px)',
            height: 'clamp(67px, 8.2vw, 103px)',
            transform: 'rotate(-20deg) scaleX(-1)',
          }}
        >
          <Image
            src="/assets/vectors/click.svg"
            alt="Click icon"
            width={100}
            height={103}
            style={{ objectFit: 'contain', width: '100%', height: '100%' }}
          />
        </div>
        {/* Título */}
        <h2 className="text-2xl md:text-3xl lg:text-3xl xl:text-4xl font-bold text-gray-900 text-center mb-6">
          Buscar trabajo no tiene que ser desgastante
        </h2>

        {/* Descripción principal */}
        <p className="text-sm md:text-sm lg:text-sm xl:text-lg text-gray-500 text-center max-w-4xl mx-auto mb-6 leading-relaxed">
          CIO - Cazador Inteligente de Ofertas, es un agente de IA para encontrar trabajo sin
          esfuerzo. Analiza tu perfil, entiende tu experiencia y rastrea todas las plataformas laborales para
          enviarte a tu WhatsApp, las ofertas que realmente hacen match con tu perfil.
        </p>

        {/* Subtexto */}
        <p className="text-sm md:text-sm lg:text-sm xl:text-lg text-gray-500 text-center mb-12">
          Sin perder tiempo. Sin estrés. Sin repetir búsquedas infinitas.
        </p>

        {/* Contenedor de video VERTICAL */}
        <div
          ref={containerRef}
          className="relative mx-auto rounded-2xl overflow-hidden bg-gradient-to-br from-[#9054C6] to-[#6B3FA0]"
          style={{
            width: 'min(300px, 80vw)',
            aspectRatio: '9 / 16', // Formato vertical de teléfono
          }}
        >
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            src={videoSrc}
            muted // Necesario para autoplay en navegadores modernos
            loop // Loop para que se repita
            playsInline
            onEnded={() => setIsPlaying(false)}
          >
            Tu navegador no soporta el elemento de video.
          </video>

          {/* Overlay con botón de play (solo cuando está pausado) */}
          {!isPlaying && (
            <button
              onClick={handlePlayClick}
              className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors duration-300 group"
              aria-label="Reproducir video"
            >
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/30 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <svg
                  className="w-8 h-8 md:w-10 md:h-10 text-white ml-1"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </button>
          )}

          {/* Botón de audio mute/unmute */}
          {isPlaying && (
            <button
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.muted = !videoRef.current.muted;
                  setIsMuted(!isMuted);
                }
              }}
              className="absolute bottom-4 right-4 bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors cursor-pointer"
              aria-label={isMuted ? 'Activar sonido' : 'Silenciar'}
            >
              {isMuted ? (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

