'use client';

import { StoreProvider, useStore } from '@/lib/store';
import { Header } from '@/components/Header';
import { UploadScreen } from '@/components/screens/UploadScreen';
import { ProcessingScreen } from '@/components/screens/ProcessingScreen';
import { ReviewScreen } from '@/components/screens/ReviewScreen';
import { PreviewScreen } from '@/components/screens/PreviewScreen';
import { DoneScreen } from '@/components/screens/DoneScreen';

function Screens() {
  const { step } = useStore();
  return (
    <div style={{ minHeight: '100vh' }}>
      <Header />
      <div style={{ maxWidth: 1600, margin: '0 auto' }}>
        {step === 'upload' && <UploadScreen />}
        {step === 'processing' && <ProcessingScreen />}
        {step === 'review' && <ReviewScreen />}
        {step === 'preview' && <PreviewScreen />}
        {step === 'done' && <DoneScreen />}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <StoreProvider>
      <Screens />
    </StoreProvider>
  );
}
