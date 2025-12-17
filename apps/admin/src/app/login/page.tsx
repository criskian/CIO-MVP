'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LogIn } from 'lucide-react';
import { login } from '@/lib/api';
import { saveAuthData, isAuthenticated } from '@/lib/auth';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Alert from '@/components/ui/Alert';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isAuthenticated()) {
      router.push('/dashboard');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const authResponse = await login({ email, password });
      saveAuthData(authResponse);
      router.push('/dashboard');
    } catch (err: any) {
      console.error('Error en login:', err);
      setError(
        err.response?.data?.message ||
        'Error al iniciar sesión. Verifica tus credenciales.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-almia-purple-dark via-almia-purple to-almia-purple-light p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -right-1/4 w-96 h-96 bg-almia-purple-light/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -left-1/4 w-96 h-96 bg-almia-purple-dark/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex justify-center mb-8">
            <Image
              src="/assets/logoalmia.svg"
              alt="Almia Logo"
              width={150}
              height={50}
              priority
            />
          </div>

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-admin-text-primary mb-2">
              Admin Panel
            </h1>
            <p className="text-admin-text-secondary">
              Ingresa tus credenciales para continuar
            </p>
          </div>

          {error && (
            <Alert variant="error" className="mb-6">
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              type="email"
              label="Email"
              placeholder="admin@almia.com.co"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />

            <Input
              type="password"
              label="Contraseña"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              size="lg"
              isLoading={isLoading}
            >
              {!isLoading && <LogIn size={20} className="mr-2" />}
              Iniciar Sesión
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-xs text-admin-text-secondary">
              © 2025 Almia Consulting SAS
            </p>
            <p className="text-xs text-admin-text-secondary mt-1">
              CIO - Cazador Inteligente de Ofertas
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

