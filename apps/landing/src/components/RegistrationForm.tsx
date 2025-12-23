'use client';

import { useState, FormEvent } from 'react';

interface RegistrationFormProps {
    onSuccess?: () => void;
    onClose?: () => void;
}

const COUNTRIES = [
    { code: '54', name: 'Argentina 🇦🇷', digits: 10 },
    { code: '591', name: 'Bolivia 🇧🇴', digits: 8 },
    { code: '1', name: 'Canadá 🇨🇦', digits: 10 },
    { code: '56', name: 'Chile 🇨🇱', digits: 9 },
    { code: '57', name: 'Colombia 🇨🇴', digits: 10 },
    { code: '506', name: 'Costa Rica 🇨🇷', digits: 8 },
    { code: '53', name: 'Cuba 🇨🇺', digits: 8 },
    { code: '593', name: 'Ecuador 🇪🇨', digits: 9 },
    { code: '503', name: 'El Salvador 🇸🇻', digits: 8 },
    { code: '34', name: 'España 🇪🇸', digits: 9 },
    { code: '1', name: 'Estados Unidos 🇺🇸', digits: 10 },
    { code: '502', name: 'Guatemala 🇬🇹', digits: 8 },
    { code: '240', name: 'Guinea Ecuatorial 🇬🇶', digits: 9 },
    { code: '504', name: 'Honduras 🇭🇳', digits: 8 },
    { code: '52', name: 'México 🇲🇽', digits: 10 },
    { code: '505', name: 'Nicaragua 🇳🇮', digits: 8 },
    { code: '507', name: 'Panamá 🇵🇦', digits: 8 },
    { code: '595', name: 'Paraguay 🇵🇾', digits: 9 },
    { code: '51', name: 'Perú 🇵🇪', digits: 9 },
    { code: '598', name: 'Uruguay 🇺🇾', digits: 8 },
    { code: '58', name: 'Venezuela 🇻🇪', digits: 10 },
];

export default function RegistrationForm({ onSuccess, onClose }: RegistrationFormProps) {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        acceptedTerms: false,
    });
    const [countryCode, setCountryCode] = useState('57');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
    const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '573226906461';

    const selectedCountry = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0];

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        let phone = formData.phone.replace(/\D/g, '');
        if (!phone.startsWith(countryCode)) {
            phone = countryCode + phone;
        }

        try {
            const response = await fetch(`${API_URL}/api/registration/freemium`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    phone,
                    acceptedTerms: formData.acceptedTerms,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Error al registrar');
            }

            setSuccess(true);
            // No cerramos el modal, mostramos mensaje de éxito
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al registrar. Intenta nuevamente.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola CIO, quiero buscar trabajo')}`;

        return (
            <div className="bg-[#9054C6] text-center py-12 px-6 rounded-b-2xl">
                <h3 className="font-poppins text-3xl font-bold text-white mb-4">
                    ¡Ya todo está listo!
                </h3>
                <p className="font-poppins text-xl font-medium text-white mb-2">
                    Registro completado
                </p>
                <p className="font-poppins text-white/90 mb-8 max-w-md mx-auto">
                    Ahora puedes comenzar tu búsqueda de empleo personalizada con CIO
                </p>
                <a
                    href={whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-poppins inline-flex items-center justify-center gap-3 px-10 py-4 bg-[#25D366] text-white font-medium rounded-lg hover:bg-white hover:text-[#25D366] border-2 border-[#25D366] transition-all duration-300 shadow-lg"
                >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                    Ir a WhatsApp
                </a>
            </div>
        );
    }

    return (
        <div className="bg-[#9054C6] rounded-b-2xl">
            <form onSubmit={handleSubmit} className="space-y-5 px-6 py-8">
                {error && (
                    <div className="bg-white/10 border border-white/30 text-white px-4 py-3 rounded-lg text-sm font-poppins">
                        {error}
                    </div>
                )}

                {/* Nombre */}
                <div>
                    <label htmlFor="name" className="font-poppins block text-sm font-medium text-white mb-2">
                        Nombre completo
                    </label>
                    <input
                        type="text"
                        id="name"
                        required
                        minLength={2}
                        maxLength={100}
                        className="font-poppins w-full px-4 py-3 border-2 border-white/30 bg-white/10 text-white placeholder-white/60 rounded-lg focus:ring-2 focus:ring-white focus:border-white outline-none transition-all"
                        placeholder="Tu nombre"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                </div>

                {/* Email */}
                <div>
                    <label htmlFor="email" className="font-poppins block text-sm font-medium text-white mb-2">
                        Correo electrónico
                    </label>
                    <input
                        type="email"
                        id="email"
                        required
                        className="font-poppins w-full px-4 py-3 border-2 border-white/30 bg-white/10 text-white placeholder-white/60 rounded-lg focus:ring-2 focus:ring-white focus:border-white outline-none transition-all"
                        placeholder="tu@email.com"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                </div>

                {/* Teléfono */}
                <div>
                    <label htmlFor="phone" className="font-poppins block text-sm font-medium text-white mb-2">
                        Número de WhatsApp
                    </label>
                    <div className="flex gap-2 w-full">
                        <select
                            value={countryCode}
                            onChange={(e) => {
                                setCountryCode(e.target.value);
                                setFormData({ ...formData, phone: '' });
                            }}
                            className="font-poppins w-24 px-2 py-3 border-2 border-white/30 bg-white/10 text-white rounded-lg focus:ring-2 focus:ring-white focus:border-white outline-none transition-all cursor-pointer appearance-none text-center"
                        >
                            {COUNTRIES.map((country) => (
                                <option key={country.code} value={country.code} className="bg-[#7c3aac] text-white">
                                    +{country.code}
                                </option>
                            ))}
                        </select>
                        <input
                            type="tel"
                            id="phone"
                            required
                            pattern={`[0-9]{${selectedCountry.digits}}`}
                            className="font-poppins flex-1 px-4 py-3 border-2 border-white/30 bg-white/10 text-white placeholder-white/60 rounded-lg focus:ring-2 focus:ring-white focus:border-white outline-none transition-all min-w-0"
                            placeholder={`${'0'.repeat(selectedCountry.digits)}`}
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, '').slice(0, selectedCountry.digits) })}
                        />
                    </div>
                    <p className="font-poppins text-xs text-white/70 mt-1">
                        {selectedCountry.name} - {selectedCountry.digits} dígitos
                    </p>
                </div>

                {/* Términos */}
                <div className="flex items-start gap-3">
                    <input
                        type="checkbox"
                        id="terms"
                        required
                        className="mt-1 w-4 h-4 text-white border-white/30 rounded focus:ring-white cursor-pointer bg-white/10"
                        checked={formData.acceptedTerms}
                        onChange={(e) => setFormData({ ...formData, acceptedTerms: e.target.checked })}
                    />
                    <label htmlFor="terms" className="font-poppins text-sm text-white/90 cursor-pointer">
                        Acepto los{' '}
                        <a href="/terms-of-service" target="_blank" className="text-white hover:underline font-medium">
                            términos de servicio
                        </a>{' '}
                        y la{' '}
                        <a href="/privacy-policy" target="_blank" className="text-white hover:underline font-medium">
                            política de privacidad
                        </a>
                    </label>
                </div>

                {/* Botón Submit */}
                <button
                    type="submit"
                    disabled={loading}
                    className="font-poppins w-full py-4 px-6 bg-white text-[#9054C6] font-normal rounded-lg hover:bg-[#9054C6]/20 hover:text-white border-2 border-white disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg"
                >
                    {loading ? 'Registrando...' : 'Registrarme gratis'}
                </button>

                <p className="font-poppins text-xs text-center text-white/70 mt-4">
                    Plan gratuito: 3 búsquedas durante 3 días
                </p>

                {/* Divider */}
                <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-white/20"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="font-poppins px-4 bg-[#9054C6] text-white/70">o</span>
                    </div>
                </div>

                {/* Link para usuarios ya registrados */}
                <a
                    href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent('Hola CIO, quiero buscar trabajo')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-poppins flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#25D366] border-2 border-[#25D366] text-white rounded-lg hover:bg-white hover:text-[#25D366] transition-all duration-300 group"
                >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                    <span>¿Ya te registraste? Chatea con CIO</span>
                </a>
            </form>
        </div>
    );
}
