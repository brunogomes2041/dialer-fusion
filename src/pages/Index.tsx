
import React from 'react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-20">
        <Hero />
      </div>
    </div>
  );
};

export default Index;
