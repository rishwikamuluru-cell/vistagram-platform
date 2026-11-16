'use client';

import React from 'react';
import { AuthView } from '@/components/auth/AuthView';

export default function LoginPage() {
  return (
    <AuthView
      initialMode="login"
      onAuthenticated={() => {
        window.location.assign('/');
      }}
    />
  );
}
