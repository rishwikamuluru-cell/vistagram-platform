'use client';

import React from 'react';
import { AuthView } from '@/components/auth/AuthView';

export default function SignupPage() {
  return (
    <AuthView
      initialMode="signup"
      onAuthenticated={() => {
        window.location.assign('/');
      }}
    />
  );
}
