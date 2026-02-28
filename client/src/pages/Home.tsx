import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Sparkles, CalendarPlus, Share2, CalendarCheck } from 'lucide-react';
import hotDateLogo from '@assets/logo.png';
import { Input } from '@/components/Input';
import { Button } from '@/components/Button';
import { useCreateEvent } from '@/hooks/use-events';
import { format, addMonths } from 'date-fns';

export default function Home() {
  const [, setLocation] = useLocation();
  const createEvent = useCreateEvent();
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1800);
    return () => clearTimeout(t);
  }, []);

const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addMonths(new Date(), 3), 'yyyy-MM-dd'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    createEvent.mutate(
      { 
        title, 
        description, 
        startDate, 
        endDate 
      },
      {
        onSuccess: (data) => {
          setLocation(`/event/${data.slug}`);
        }
      }
    );
  };

  return (
    <>
      <AnimatePresence>
        {!splashDone && (
          <motion.div
            key="splash"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background overflow-hidden"
          >
            {/* Retro glow blobs matching the logo palette */}
            <div className="absolute w-[60vw] h-[60vw] rounded-full bg-orange-400/20 blur-[120px] top-[-10%] left-1/2 -translate-x-1/2 pointer-events-none" />
            <div className="absolute w-[40vw] h-[40vw] rounded-full bg-pink-500/20 blur-[100px] bottom-0 left-0 pointer-events-none" />
            <div className="absolute w-[40vw] h-[40vw] rounded-full bg-purple-600/20 blur-[100px] bottom-0 right-0 pointer-events-none" />
            <motion.img
              src={hotDateLogo}
              alt="Hot Date"
              initial={{ scale: 0.75, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
              className="w-72 sm:w-96 h-auto relative z-10 drop-shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

    <div className="min-h-screen flex flex-col items-center overflow-x-hidden relative">
      {/* Logo: absolutely positioned — acts as a decorative background header */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: splashDone ? 1 : 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="absolute top-0 left-0 right-0 px-4 pt-8 sm:pt-12"
      >
        <img
          src={hotDateLogo}
          alt="Hot Date"
          className="w-full h-auto"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 10%, black 90%, transparent)',
          }}
        />
      </motion.div>

      {/* Spacer — controls how much of the logo peeks above the form */}
      <div className="h-16 sm:h-24 w-full shrink-0" />

      {/* Form: normal flow + z-10, reliably above the absolute logo */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: splashDone ? 1 : 0, y: splashDone ? 0 : 20 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-2xl mx-auto flex flex-col gap-12 px-4 sm:px-8 pb-12"
      >

        <div className="bg-card/90 backdrop-blur-sm p-6 sm:p-10 rounded-[2rem] border neon-card">
          <div className="flex items-center gap-3 mb-8">
            <Sparkles className="text-pink-400 drop-shadow-[0_0_8px_rgba(255,0,144,0.8)]" size={24} />
            <h2 className="text-2xl font-bold bg-gradient-to-r from-cyan-300 via-white to-pink-300 bg-clip-text text-transparent">Create an event</h2>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <Input
              label="Event Name"
              placeholder="e.g. Summer Cabin Trip"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              className="text-lg py-4"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-hidden">
              <Input
                type="date"
                label="Earliest Date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <Input
                type="date"
                label="Latest Date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium neon-label">
                Description <span className="text-muted-foreground font-normal">(Optional)</span>
              </label>
              <textarea
                placeholder="What's this about?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-secondary/50 border text-foreground placeholder:text-muted-foreground focus:outline-none transition-all duration-200 resize-none neon-input"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              className="mt-2 group"
              isLoading={createEvent.isPending}
              disabled={!title.trim()}
            >
              Get Started
              <ArrowRight className="ml-2 w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Button>
          </form>

          <div className="mt-8 pt-8 border-t border-border/50">
            <div className="flex items-start gap-3 text-muted-foreground">
              <div className="p-2 bg-secondary/50 rounded-lg shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-lock"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div className="text-xs leading-relaxed">
                <p className="font-semibold text-foreground mb-1">Secure & Simple</p>
                <p>No passwords required—access your events directly via your unique, secure URL.</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-center text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-8">How it works</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { icon: CalendarPlus, step: "1", text: "Create an event" },
              { icon: Share2, step: "2", text: "Share the link with the people you want to invite" },
              { icon: CalendarCheck, step: "3", text: "Compare the dates where everyone's available" },
            ].map((item) => (
              <div key={item.step} className="flex flex-col items-center text-center gap-3 px-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <item.icon className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
    </>
  );
}
