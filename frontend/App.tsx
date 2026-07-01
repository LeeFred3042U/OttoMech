import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Wifi, WifiOff, MapPin, Phone, MessageSquare, Clock, ArrowRight, Lock, 
  AlertCircle, Wrench, CheckCircle2, Sparkles, Download, User, Map, 
  Send, RefreshCw, FileText, Camera, UploadCloud, Award, Info, Star, ChevronRight,
  Sun, Moon, CreditCard, QrCode
} from 'lucide-react';
import { LUCKNOW_GARAGES } from './data/garages';
import { Garage, AIDiagnosis, ChatMessage, JobReceipt, IssueCategory, Coords } from './types';
import Logo from './components/Logo';
import LucknowMap from './components/LucknowMap';
import OfflineEmergency from './components/OfflineEmergency';
import { generateReceiptPDF } from './components/PDFGenerator';

export default function App() {
  // --- UI, Theme, & Environment State ---
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');
  const [isDark, setIsDark] = useState(true);
  const [isOffline, setIsOffline] = useState(false);
  const [currentTime, setCurrentTime] = useState('11:00 PM');
  const [currentStep, setCurrentStep] = useState<'login' | 'dashboard' | 'broadcasting' | 'tracking' | 'payment' | 'completed'>('login');
  
  // --- Dual-Portal Role Selection State ---
  const [userRole, setUserRole] = useState<'customer' | 'mechanic' | null>(null);

  // --- Mechanic Portal Specific States ---
  const [mechanicStep, setMechanicStep] = useState<'login' | 'setup' | 'dashboard' | 'active-job' | 'completed'>('login');
  const [mechPhone, setMechPhone] = useState('');
  const [mechOtpCode, setMechOtpCode] = useState('');
  const [mechOtpSent, setMechOtpSent] = useState(false);
  const [mechIsLoading, setMechIsLoading] = useState(false);

  // Mechanic Profile Details
  const [mechName, setMechName] = useState('Hazratganj Roadside Wizards');
  const [mechContact, setMechContact] = useState('7007211984');
  const [mechNeighborhood, setMechNeighborhood] = useState('Hazratganj');
  const [mechSpecialties, setMechSpecialties] = useState<IssueCategory[]>(['Tyre', 'Battery', 'Other']);
  const [mechBaseFee, setMechBaseFee] = useState(300);
  const [mechServiceFee, setMechServiceFee] = useState(450);
  const [mechStatus, setMechStatus] = useState<'online' | 'standby'>('online');
  const [mechUpiId, setMechUpiId] = useState('wizards.up32@okaxis');
  const [mechBankAccount, setMechBankAccount] = useState('987654321099');
  const [mechIfscCode, setMechIfscCode] = useState('SBIN0000123');
  const [mechBankName, setMechBankName] = useState('State Bank of India');

  // Mechanic Stats
  const [mechEarnings, setMechEarnings] = useState(14500);
  const [mechCompletedCount, setMechCompletedCount] = useState(18);
  const [mechOnTimeRate, setMechOnTimeRate] = useState(96);
  const [mechReliabilityIndex, setMechReliabilityIndex] = useState(94);

  // Simulated Incoming Breakdown Request for Mechanic
  interface IncomingRequest {
    id: string;
    driverName: string;
    driverPhone: string;
    driverAddress: string;
    driverCoords: Coords;
    category: IssueCategory;
    description: string;
    distance: number;
    estimatedPayout: number;
    aiDiagnosis: AIDiagnosis;
    photos: string[];
  }
  const [incomingRequest, setIncomingRequest] = useState<IncomingRequest | null>(null);
  const [mechActiveJob, setMechActiveJob] = useState<IncomingRequest | null>(null);
  const [mechDispatchProgress, setMechDispatchProgress] = useState(0); // 0 to 100%
  const [mechJobStep, setMechJobStep] = useState<'navigating' | 'diagnosing' | 'repairing' | 'completed'>('navigating');
  const [mechChatMessages, setMechChatMessages] = useState<ChatMessage[]>([]);
  const [mechChatInput, setMechChatInput] = useState('');
  const [mechInvoiceParts, setMechInvoiceParts] = useState<string[]>([]);
  const [mechInvoicePartsFee, setMechInvoicePartsFee] = useState(0);
  const [mechGeneratedReceipt, setMechGeneratedReceipt] = useState<JobReceipt | null>(null);
  
  // --- Authentication State ---
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  // --- Location & Issue Input State ---
  const [driverAddress, setDriverAddress] = useState('Faizabad Road, Near Chinhat Flyover, Lucknow');
  const [driverCoords, setDriverCoords] = useState<Coords>({ lat: 26.8895, lng: 81.0312 }); // Stranded in Chinhat
  const [isLocating, setIsLocating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<IssueCategory>('Tyre');
  const [issueDescription, setIssueDescription] = useState('');
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<AIDiagnosis | null>(null);
  
  // --- Damage Photos State (Limit to 10) ---
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showMobileImportModal, setShowMobileImportModal] = useState(false);

  // --- Dispatch & Matchmaking State ---
  const [matchedMechanic, setMatchedMechanic] = useState<Garage | null>(null);
  const [broadcastProgress, setBroadcastProgress] = useState(0);
  const [closestGarages, setClosestGarages] = useState<Garage[]>([]);
  
  // --- Live Chat & Active Tracking State ---
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userMessageText, setUserMessageText] = useState('');
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatTimeoutsRef = useRef<any[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);
  const [isPaymentProcessing, setIsPaymentProcessing] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);

  // --- Final Invoice Receipt State ---
  const [generatedReceipt, setGeneratedReceipt] = useState<JobReceipt | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // --- Dynamic Mock Photo Bank ---
  const MOCK_PHOTOS: Record<IssueCategory, string> = {
    Tyre: "https://images.unsplash.com/photo-1578844251758-2f71da64c96f?auto=format&fit=crop&q=80&w=400", // Flat tyre
    Battery: "https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&q=80&w=400", // Car battery
    Engine: "https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&q=80&w=400", // Engine smoking
    Overheating: "https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?auto=format&fit=crop&q=80&w=400", // Radiator steam
    Other: "https://images.unsplash.com/photo-1507136566006-cfc505b114fc?auto=format&fit=crop&q=80&w=400" // Mechanical tool grease
  };

  // --- Theme Resolver Loop ---
  useEffect(() => {
    // Read saved theme if any
    const savedTheme = localStorage.getItem('theme') as 'system' | 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'system') {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setIsDark(systemPrefersDark);
    } else {
      setIsDark(theme === 'dark');
    }
  }, [theme]);

  // System preference change listener
  useEffect(() => {
    if (theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDark(e.matches);
    };
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  // Keep Clock Updated to mimic Real-Time Native Feel
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      let hours = now.getHours();
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // the hour '0' should be '12'
      setCurrentTime(`${hours}:${minutes} ${ampm}`);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Cleanup chat dispatches on unmount
  useEffect(() => {
    return () => {
      if (chatTimeoutsRef.current) {
        chatTimeoutsRef.current.forEach(clearTimeout);
      }
    };
  }, []);

  // Calculate Nearest Garages using Haversine formula
  const calculateNearestGarages = (category: IssueCategory) => {
    const calculated = LUCKNOW_GARAGES.map(garage => {
      const R = 6371; // Earth radius in km
      const dLat = (garage.lat - driverCoords.lat) * Math.PI / 180;
      const dLon = (garage.lng - driverCoords.lng) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(driverCoords.lat * Math.PI / 180) * Math.cos(garage.lat * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;
      return { ...garage, distance: parseFloat(distance.toFixed(2)) };
    });

    return calculated
      .filter(g => g.specialties.includes(category) || g.specialties.includes('Other'))
      .sort((a, b) => (a.distance || 0) - (b.distance || 0));
  };

  // Auto-Detect Location
  const handleDetectLocation = () => {
    setIsLocating(true);
    setTimeout(() => {
      const landmarks = [
        { name: "Faizabad Road, near Kamta Crossing, Chinhat, Lucknow", lat: 26.8824, lng: 81.0256 },
        { name: "Patrakar Puram Chauraha, Gomti Nagar, Lucknow", lat: 26.8458, lng: 81.0072 },
        { name: "Shahnajaf Road, near Cathedral, Hazratganj, Lucknow", lat: 26.8512, lng: 80.9458 },
        { name: "NH-27 bypass, Matiyari Chauraha, Chinhat, Lucknow", lat: 26.8872, lng: 81.0345 },
        { name: "Transport Nagar Road, near RTO Office, Lucknow", lat: 26.7785, lng: 80.8842 }
      ];
      const picked = landmarks[Math.floor(Math.random() * landmarks.length)];
      setDriverAddress(picked.name);
      setDriverCoords({ lat: picked.lat, lng: picked.lng });
      setIsLocating(false);
    }, 1200);
  };

  // Handle Phone Verification OTP
  const handleRequestOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber || phoneNumber.length < 10) return;
    setIsAuthLoading(true);
    setTimeout(() => {
      setOtpSent(true);
      setIsAuthLoading(false);
    }, 1000);
  };

  const handleVerifyOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode) return;
    setIsAuthLoading(true);
    setTimeout(() => {
      setCurrentStep('dashboard');
      setIsAuthLoading(false);
    }, 1200);
  };

  // --- Mechanic Portal Helper Handlers & Simulations ---
  
  const handleRequestMechOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mechPhone || mechPhone.length < 10) return;
    setMechIsLoading(true);
    setTimeout(() => {
      setMechOtpSent(true);
      setMechIsLoading(false);
    }, 1000);
  };

  const handleVerifyMechOTP = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mechOtpCode) return;
    setMechIsLoading(true);
    setTimeout(() => {
      setMechanicStep('setup');
      setMechIsLoading(false);
    }, 1200);
  };

  const getNeighborhoodCoords = (neigh: string): Coords => {
    switch (neigh) {
      case 'Hazratganj': return { lat: 26.8512, lng: 80.9458 };
      case 'Gomti Nagar': return { lat: 26.8458, lng: 81.0072 };
      case 'Lalbagh': return { lat: 26.8485, lng: 80.9324 };
      case 'Chinhat': return { lat: 26.8895, lng: 81.0312 };
      case 'Indira Nagar': return { lat: 26.8850, lng: 80.9920 };
      case 'Alambagh': return { lat: 26.8124, lng: 80.8984 };
      case 'Transport Nagar': return { lat: 26.7785, lng: 80.8842 };
      default: return { lat: 26.8512, lng: 80.9458 };
    }
  };

  const BREAKDOWN_TEMPLATES = [
    {
      id: 'req_1',
      driverName: "Rohit Agrawal",
      driverPhone: "+91 94150 12891",
      driverAddress: "Near Patrakar Puram Crossing, Gomti Nagar, Lucknow",
      driverCoords: { lat: 26.8458, lng: 81.0072 },
      category: 'Tyre' as IssueCategory,
      description: "My front-right tubeless tyre punctured on a sharp piece of glass. Don't have a spare jack. Need urgent assistance.",
      distance: 2.1,
      estimatedPayout: 550,
      aiDiagnosis: {
        issue: "Front Right Tubeless Tyre Puncture",
        likelyCause: "Extraneous road debris penetration (glass/sharp shard).",
        severity: "Medium" as const,
        recommendedAction: "Apply immediate high-grade vulcanized rubber plug & re-inflate to 33 PSI.",
        estCostRange: "₹350 - ₹550",
        suggestedParts: ["Heavy tubeless tire plug", "Inflation nozzle"]
      },
      photos: ["https://images.unsplash.com/photo-1578844251758-2f71da64c96f?auto=format&fit=crop&q=80&w=400"]
    },
    {
      id: 'req_2',
      driverName: "Priya Srivastava",
      driverPhone: "+91 91402 33451",
      driverAddress: "NH-27 bypass, Near Matiyari Overpass, Chinhat, Lucknow",
      driverCoords: { lat: 26.8872, lng: 81.0345 },
      category: 'Battery' as IssueCategory,
      description: "Engine clicking but won't crank. Headlights are extremely dim. Left cabin lights on overnight.",
      distance: 5.8,
      estimatedPayout: 800,
      aiDiagnosis: {
        issue: "Critical Battery Depth Discharge",
        likelyCause: "Sustained overnight drainage (dome lights / parasitical draw).",
        severity: "High" as const,
        recommendedAction: "Provide high-amp boost jumper start and test alternator voltage.",
        estCostRange: "₹600 - ₹850",
        suggestedParts: ["Terminal anti-corrosion grease", "Heavy jumper clamp"]
      },
      photos: ["https://images.unsplash.com/photo-1619642751034-765dfdf7c58e?auto=format&fit=crop&q=80&w=400"]
    },
    {
      id: 'req_3',
      driverName: "Mohd. Safdar",
      driverPhone: "+91 98894 40212",
      driverAddress: "Hazratganj Multi-Level Parking Area, Lucknow",
      driverCoords: { lat: 26.8512, lng: 80.9458 },
      category: 'Overheating' as IssueCategory,
      description: "White vapor rising from under-hood coolant tank. Temp dial is fully pinned into the red zone.",
      distance: 0.8,
      estimatedPayout: 1200,
      aiDiagnosis: {
        issue: "Radiator Cooling Loop Rupture",
        likelyCause: "Blown expansion hose or dry radiator tank.",
        severity: "Critical" as const,
        recommendedAction: "Top up with ethylene glycol coolant, inspect hoses, check thermostat valve.",
        estCostRange: "₹900 - ₹1,400",
        suggestedParts: ["Silicone radiator hose", "Ethylene glycol coolant top-up"]
      },
      photos: ["https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?auto=format&fit=crop&q=80&w=400"]
    },
    {
      id: 'req_4',
      driverName: "Col. Suresh Verma",
      driverPhone: "+91 70075 90023",
      driverAddress: "Faizabad Road, near Kamta Crossing, Lucknow",
      driverCoords: { lat: 26.8824, lng: 81.0256 },
      category: 'Engine' as IssueCategory,
      description: "Appalling rattling noise from drive belt. Check engine lamp is flashing frantically.",
      distance: 4.5,
      estimatedPayout: 1600,
      aiDiagnosis: {
        issue: "Serpentine Accessory Belt Slippage",
        likelyCause: "Tensile stretch or tensioner bearing failure.",
        severity: "High" as const,
        recommendedAction: "Fit standard replacements or tighten tensioner bolt.",
        estCostRange: "₹1,200 - ₹1,800",
        suggestedParts: ["Micro-V ribbed accessory belt", "Tensioner pulley assembly"]
      },
      photos: ["https://images.unsplash.com/photo-1486006920555-c77dce18193b?auto=format&fit=crop&q=80&w=400"]
    }
  ];

  const ACCESSORY_PARTS = {
    Tyre: [
      { name: "Heavy Tubeless Rubber Plug Pack", price: 150 },
      { name: "Rim sealant & tyre rim bead", price: 250 },
      { name: "Replacement Air Valve core", price: 100 },
      { name: "Emergency temporary spare tyre mount", price: 500 }
    ],
    Battery: [
      { name: "High-Amp Copper Jumper Cable loan", price: 150 },
      { name: "Brass battery terminals (set of 2)", price: 250 },
      { name: "Distilled water top-up (1L)", price: 80 },
      { name: "Emergency temporary lead-acid battery", price: 4200 }
    ],
    Engine: [
      { name: "Micro-V Ribbed Accessory Belt", price: 650 },
      { name: "Spark Plug spark gap core (single)", price: 320 },
      { name: "High-temp engine gasket adhesive", price: 200 },
      { name: "Engine oil top-up (Shell Helix 1L)", price: 600 }
    ],
    Overheating: [
      { name: "Ethylene glycol high-grade coolant (1L)", price: 350 },
      { name: "Silicone pressure hose coupling", price: 280 },
      { name: "Metal tensioner hose clamp clip", price: 80 },
      { name: "Cooling system sealing compound", price: 400 }
    ],
    Other: [
      { name: "Wurth Rust-Off penetrant spray", price: 120 },
      { name: "Insulation electric tape roll", price: 60 },
      { name: "Standard bracket fasteners & clips", price: 150 },
      { name: "Premium lubricant fluid spray", price: 240 }
    ]
  };

  // Simulated Breakdown Alert Generator for Mechanic Portal
  useEffect(() => {
    if (userRole !== 'mechanic' || mechanicStep !== 'dashboard' || mechStatus !== 'online' || incomingRequest || mechActiveJob) return;

    const timer = setTimeout(() => {
      const template = BREAKDOWN_TEMPLATES[Math.floor(Math.random() * BREAKDOWN_TEMPLATES.length)];
      
      // Calculate dynamic distance from the mechanic's neighborhood
      const mechCoords = getNeighborhoodCoords(mechNeighborhood);
      const R = 6371;
      const dLat = (template.driverCoords.lat - mechCoords.lat) * Math.PI / 180;
      const dLon = (template.driverCoords.lng - mechCoords.lng) * Math.PI / 180;
      const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(mechCoords.lat * Math.PI / 180) * Math.cos(template.driverCoords.lat * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const dist = parseFloat((R * c).toFixed(1));

      setIncomingRequest({
        ...template,
        distance: dist
      });
    }, 5000);

    return () => clearTimeout(timer);
  }, [userRole, mechanicStep, mechStatus, incomingRequest, mechActiveJob, mechNeighborhood]);

  const handleAcceptJob = () => {
    if (!incomingRequest) return;
    setMechActiveJob(incomingRequest);
    setIncomingRequest(null);
    setMechanicStep('active-job');
    setMechJobStep('navigating');
    setMechDispatchProgress(0);
    setMechInvoiceParts([]);
    setMechInvoicePartsFee(0);
    setMechGeneratedReceipt(null);

    // Seed initial active job chat
    const initialMessages: ChatMessage[] = [
      { id: 'm1', sender: 'system', text: `You accepted ${incomingRequest.driverName}'s emergency alert. Navigate to location.`, timestamp: currentTime },
      { id: 'm2', sender: 'driver', text: `Hello! Yes, I am stranded here. I see your live workshop is located in ${mechNeighborhood}. How soon can you arrive?`, timestamp: currentTime }
    ];
    setMechChatMessages(initialMessages);
  };

  const handleRejectJob = () => {
    setIncomingRequest(null);
  };

  // Mechanic Dispatch / Navigation Simulation
  useEffect(() => {
    if (userRole !== 'mechanic' || mechanicStep !== 'active-job' || mechJobStep !== 'navigating') return;

    const interval = setInterval(() => {
      setMechDispatchProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setMechJobStep('diagnosing');
          
          setMechChatMessages(m => [
            ...m,
            { id: `m_arr_${Date.now()}`, sender: 'system', text: "Mechanic has arrived at your location with tools. Inspection is in progress.", timestamp: currentTime },
            { id: `m_drv_arrived_${Date.now()}`, sender: 'driver', text: "Great! I see you pull up. I'm standing by the driver's side.", timestamp: currentTime }
          ]);
          return 100;
        }
        return prev + 10;
      });
    }, 1200);

    return () => clearInterval(interval);
  }, [userRole, mechanicStep, mechJobStep]);

  useEffect(() => {
    if (userRole !== 'mechanic' || mechanicStep !== 'active-job' || mechJobStep !== 'navigating') return;

    const t1 = setTimeout(() => {
      setMechChatMessages(m => [
        ...m,
        { id: `m_mid_1_${Date.now()}`, sender: 'driver', text: "Please look for hazard indicators. I'm right next to the landmark.", timestamp: currentTime }
      ]);
    }, 5000);

    return () => clearTimeout(t1);
  }, [userRole, mechanicStep, mechJobStep]);

  const handleSendMechChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!mechChatInput.trim()) return;

    const newMsg: ChatMessage = {
      id: `m_msg_${Date.now()}`,
      sender: 'mechanic',
      text: mechChatInput,
      timestamp: currentTime
    };

    setMechChatMessages(prev => [...prev, newMsg]);
    setMechChatInput('');

    setTimeout(() => {
      setMechChatMessages(prev => [
        ...prev,
        { id: `m_msg_rep_${Date.now()}`, sender: 'driver', text: "Understood, thank you. I'll stay clear of traffic.", timestamp: currentTime }
      ]);
    }, 2500);
  };

  const handleTogglePart = (partName: string, price: number) => {
    if (mechInvoiceParts.includes(partName)) {
      setMechInvoiceParts(prev => prev.filter(p => p !== partName));
      setMechInvoicePartsFee(prev => prev - price);
    } else {
      setMechInvoiceParts(prev => [...prev, partName]);
      setMechInvoicePartsFee(prev => prev + price);
    }
  };

  const handleGenerateInvoice = () => {
    if (!mechActiveJob) return;
    const partsCost = mechInvoicePartsFee;
    const total = mechBaseFee + mechServiceFee + partsCost;

    const platformFee = Math.round(total * 0.1);
    const mechanicFee = total - platformFee;
    const last4 = mechBankAccount.slice(-4);
    const bankDetails = `${mechBankName} (A/c ****${last4 || '1099'})`;
    const txId = 'TXN' + Math.floor(100000000000 + Math.random() * 900000000000).toString();

    const receiptObj: JobReceipt = {
      invoiceId: 'MECH-' + Math.floor(Math.random() * 90000 + 10000),
      date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      time: currentTime,
      driverPhone: mechActiveJob.driverPhone,
      location: mechActiveJob.driverAddress,
      garageName: mechName,
      garagePhone: `+91 ${mechContact}`,
      issueCategory: mechActiveJob.category,
      issueDescription: mechActiveJob.description,
      partsUsed: mechInvoiceParts.length > 0 ? mechInvoiceParts : ["None"],
      baseFee: mechBaseFee,
      serviceFee: mechServiceFee,
      partsFee: partsCost,
      totalFee: total,
      paymentMethod: "UPI Digital Payout (BHIM / GPay)",
      warrantyPeriod: "30 Days Service Guarantee",
      gpsCoords: `${mechActiveJob.driverCoords.lat.toFixed(4)}, ${mechActiveJob.driverCoords.lng.toFixed(4)}`,
      platformFee,
      mechanicFee,
      mechanicBankDetails: bankDetails,
      transactionId: txId
    };

    setMechGeneratedReceipt(receiptObj);
    // Sync to customer side
    setGeneratedReceipt(receiptObj);
    setPaymentDone(false);
    setMechanicStep('completed');
  };

  // Triggers Gemini API `/api/diagnose` server endpoint
  const handleGetAIDiagnosis = async () => {
    setIsDiagnosing(true);
    setAiDiagnosis(null);

    try {
      const response = await fetch('/api/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          description: issueDescription || `Standard vehicle breakdown under category ${selectedCategory}`,
          photoUploaded: uploadedPhotos.length > 0
        })
      });

      const data = await response.json();
      if (data.success) {
        setAiDiagnosis(data.diagnosis);
      } else {
        throw new Error(data.errorInfo || "Diagnostic failure");
      }
    } catch (error) {
      console.error("AI Diagnosis Error, using rule fallback:", error);
      setAiDiagnosis({
        issue: `${selectedCategory} Warning Alert`,
        likelyCause: "Unforeseen physical wear or thermal load on engine components.",
        severity: "High",
        recommendedAction: "Safely pull vehicle to the road shoulder and activate hazard lights.",
        estCostRange: "₹450 - ₹1,200",
        suggestedParts: ["Consumable items", "Lubricant pack"]
      });
    } finally {
      setIsDiagnosing(false);
    }
  };

  // Multiple File uploads converting to base64
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    const remainingSlots = 10 - uploadedPhotos.length;
    if (remainingSlots <= 0) return;
    
    const filesToProcess = Array.from(files).slice(0, remainingSlots);
    
    filesToProcess.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setUploadedPhotos(prev => [...prev, reader.result as string].slice(0, 10));
        }
      };
      reader.readAsDataURL(file as Blob);
    });
  };

  const triggerFileInput = () => {
    if (uploadedPhotos.length >= 10) return;
    fileInputRef.current?.click();
  };

  const handleAddMockPhoto = () => {
    if (uploadedPhotos.length >= 10) return;
    const mockPic = MOCK_PHOTOS[selectedCategory];
    setUploadedPhotos(prev => [...prev, mockPic].slice(0, 10));
  };

  // SOS Emergency Call Dispatch Loop
  const handleTriggerSOS = () => {
    const list = calculateNearestGarages(selectedCategory);
    setClosestGarages(list.slice(0, 3));
    setCurrentStep('broadcasting');
    setBroadcastProgress(0);

    const interval = setInterval(() => {
      setBroadcastProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          const matched = list.find(g => g.status === 'online') || list[0];
          setMatchedMechanic(matched);
          setCurrentStep('tracking');
          setIsDispatching(true);
          initiateLiveChat(matched);
          return 100;
        }
        return prev + 20;
      });
    }, 800);
  };

  // Simulate In-App Chat Messages
  const initiateLiveChat = (mechanic: Garage) => {
    // Clear any existing simulation timeouts before starting a new chat session
    if (chatTimeoutsRef.current) {
      chatTimeoutsRef.current.forEach(clearTimeout);
    }
    chatTimeoutsRef.current = [];

    const nowStr = Date.now().toString();

    setChatMessages([
      { id: `sys-assigned-${nowStr}`, sender: 'system', text: `Emergency job assigned to ${mechanic.name}.`, timestamp: '11:02 PM' },
      { id: `mech-hello-${nowStr}`, sender: 'mechanic', text: `Hello sir, I am dispatching immediately from our ${mechanic.neighborhood} center.`, timestamp: '11:03 PM' }
    ]);

    const t1 = setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        { id: `mech-details-${nowStr}`, sender: 'mechanic', text: `Traffic looks clear on the corridor. I am bringing ${selectedCategory === 'Battery' ? 'jumper cables & test battery' : selectedCategory === 'Tyre' ? 'heavy jack & tubeless patches' : 'standard scan kit'}.`, timestamp: '11:05 PM' }
      ]);
    }, 8000);

    const t2 = setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        { id: `mech-nearby-${nowStr}`, sender: 'mechanic', text: `I am crossing the nearby crossing now, about 2 minutes away. Please keep hazard lights blinking.`, timestamp: '11:08 PM' }
      ]);
    }, 18000);

    chatTimeoutsRef.current.push(t1, t2);
  };

  // Auto Scroll Chat list
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendUserMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userMessageText.trim()) return;

    const newMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: 'driver',
      text: userMessageText,
      timestamp: currentTime
    };

    setChatMessages(prev => [...prev, newMsg]);
    setUserMessageText('');

    setTimeout(() => {
      setChatMessages(prev => [
        ...prev,
        { id: Math.random().toString(), sender: 'mechanic', text: "Noted. Keep safe inside the cabin.", timestamp: currentTime }
      ]);
    }, 2000);
  };

  const handleMechanicArrived = () => {
    setIsDispatching(false);
    setChatMessages(prev => [
      ...prev,
      { id: `arr-${Date.now()}`, sender: 'system', text: "Mechanic has arrived at your GPS location. Diagnosis and repair underway.", timestamp: currentTime }
    ]);
  };

  // Complete Job, Process UPI, generate receipt
  const handleMarkJobCompleted = () => {
    setIsPaymentProcessing(true);
    setTimeout(() => {
      setIsPaymentProcessing(false);
      setPaymentDone(false);

      const invoiceNum = Math.floor(100000 + Math.random() * 900000).toString();
      const baseCallout = matchedMechanic?.id === 'self_mech' ? mechBaseFee : (matchedMechanic as any)?.baseFee || 300;
      const serviceCharge = matchedMechanic?.id === 'self_mech' ? mechServiceFee : (matchedMechanic as any)?.serviceFee || (selectedCategory === 'Tyre' ? 250 : selectedCategory === 'Overheating' ? 600 : 800);
      const partsCharge = selectedCategory === 'Tyre' ? 150 : selectedCategory === 'Battery' ? 0 : 450;
      const total = baseCallout + serviceCharge + partsCharge;

      const targetUpiId = matchedMechanic?.id === 'self_mech' ? mechUpiId : (matchedMechanic as any)?.upiId || 'partner.up32@okaxis';
      const targetBankName = matchedMechanic?.id === 'self_mech' ? mechBankName : (matchedMechanic as any)?.bankName || 'State Bank of India';
      const targetBankAccount = matchedMechanic?.id === 'self_mech' ? mechBankAccount : (matchedMechanic as any)?.bankAccount || '987654321099';
      const last4 = targetBankAccount.slice(-4);
      const bankDetails = `${targetBankName} (A/c ****${last4 || '1099'})`;
      const txId = 'TXN' + Math.floor(100000000000 + Math.random() * 900000000000).toString();

      const platformFee = Math.round(total * 0.1);
      const mechanicFee = total - platformFee;

      const receiptObj: JobReceipt = {
        invoiceId: invoiceNum,
        date: new Date().toLocaleDateString('en-IN'),
        time: currentTime,
        driverPhone: phoneNumber || "+91 94512 80931",
        location: driverAddress,
        garageName: matchedMechanic?.name || "NH-27 Highway Assistance",
        garagePhone: matchedMechanic?.phone || "+91 70072 11984",
        issueCategory: selectedCategory,
        issueDescription: issueDescription || `Breakdown assistance for: ${selectedCategory}`,
        partsUsed: selectedCategory === 'Tyre' ? ["Tubeless repair plugs", "Valves"] : selectedCategory === 'Engine' ? ["Belt strap"] : [],
        baseFee: baseCallout,
        serviceFee: serviceCharge,
        partsFee: partsCharge,
        totalFee: total,
        paymentMethod: "BHIM UPI",
        warrantyPeriod: matchedMechanic?.warranty || "90 Days Warranty",
        gpsCoords: `${driverCoords.lat.toFixed(4)}, ${driverCoords.lng.toFixed(4)}`,
        platformFee,
        mechanicFee,
        mechanicBankDetails: bankDetails,
        transactionId: txId
      };

      setGeneratedReceipt(receiptObj);
      setCurrentStep('payment');
    }, 1500);
  };

  // Trigger PDF Downloader
  const handleDownloadInvoice = () => {
    if (!generatedReceipt) return;
    setIsDownloading(true);
    setTimeout(() => {
      generateReceiptPDF(generatedReceipt);
      setIsDownloading(false);
    }, 1200);
  };

  // Handle Offline Emergency direct phone triggers
  const handleOfflineCallMechanic = (garage: Garage) => {
    const invoiceNum = "OFF-" + Math.floor(100000 + Math.random() * 900000).toString();
    const receiptObj: JobReceipt = {
      invoiceId: invoiceNum,
      date: new Date().toLocaleDateString('en-IN'),
      time: currentTime,
      driverPhone: phoneNumber || "Standard Offline Driver",
      location: "Faizabad Road, near Kamta Crossing, Lucknow (Offline)",
      garageName: garage.name,
      garagePhone: garage.phone,
      issueCategory: selectedCategory,
      issueDescription: "Offline Cellular Call-out SOS",
      partsUsed: ["Offline standard emergency dispatch kit"],
      baseFee: 300,
      serviceFee: 500,
      partsFee: 0,
      totalFee: 800,
      paymentMethod: "Cash on delivery / Offline Cash",
      warrantyPeriod: garage.warranty,
      gpsCoords: "26.8872, 81.0345"
    };

    setMatchedMechanic(garage);
    setGeneratedReceipt(receiptObj);
    setCurrentStep('completed');
  };

  // Dynamic conditional class helpers for theme
  const outerBg = isDark ? 'bg-[#0a0a0a]' : 'bg-slate-100';
  const deviceBorder = isDark ? 'bg-[#121212] md:border-[#222] shadow-[0_0_50px_rgba(37,99,235,0.15)]' : 'bg-white md:border-slate-200 shadow-2xl';
  const headerBg = isDark ? 'bg-[#121212] border-[#222]' : 'bg-white border-slate-100';
  const notchBg = isDark ? 'bg-[#121212] text-slate-400' : 'bg-white text-slate-600';
  const contentBg = isDark ? 'bg-[#121212]' : 'bg-white';
  const cardBg = isDark ? 'bg-[#1a1a1a] border-[#262626]' : 'bg-slate-50 border-slate-200';
  const textPrimary = isDark ? 'text-slate-100' : 'text-slate-900';
  const textSecondary = isDark ? 'text-slate-400' : 'text-slate-500';
  const inputBg = isDark ? 'bg-[#121212] border-[#262626] text-slate-200' : 'bg-white border-slate-200 text-slate-800';

  return (
    <div className={`min-h-screen flex items-center justify-center p-0 md:p-6 select-none font-sans overflow-hidden transition-colors duration-300 ${outerBg}`}>
      
      {/* Device frame container mimicking elegant mobile portrait design */}
      <div className={`w-full max-w-[420px] h-screen md:h-[860px] flex flex-col relative overflow-hidden transition-all duration-300 md:rounded-[3rem] md:border-[10px] ${deviceBorder}`}>
        
        {/* Mobile Device Notch / Status Bar */}
        <div className={`px-5 pt-3 pb-1 flex justify-between items-center text-xs font-semibold select-none shrink-0 z-30 transition-colors ${notchBg}`}>
          <span className={`font-mono text-[11px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{currentTime}</span>
          
          {/* Mock Speaker Notch on Desktop */}
          <div className={`hidden md:block w-20 h-4.5 rounded-b-xl absolute left-1/2 -translate-x-1/2 top-0 ${isDark ? 'bg-[#222]' : 'bg-slate-200'}`} />

          <div className="flex items-center gap-2">
            {isOffline ? (
              <WifiOff className="w-4 h-4 text-blue-500 animate-pulse" />
            ) : (
              <Wifi className="w-4 h-4 text-emerald-500" />
            )}
            <span className="text-[10px] font-mono text-slate-400">UP-32</span>
            
            {/* Battery Indicator */}
            <div className={`w-5 h-2.5 border rounded-sm p-0.5 flex items-center ${isDark ? 'border-[#262626]' : 'border-slate-300'}`}>
              <div className={`h-full w-4/5 rounded-2xs ${isDark ? 'bg-slate-400' : 'bg-slate-600'}`} />
            </div>
          </div>
        </div>

        {/* Dynamic App Title Header (with Offline and Theme simulators) */}
        <div className={`px-6 py-3 flex justify-between items-center shrink-0 z-20 transition-all border-b ${headerBg}`}>
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { 
            if (userRole === 'customer') {
              if (currentStep !== 'login') {
                setCurrentStep('dashboard');
              } else {
                setUserRole(null);
                setOtpSent(false);
              }
            } else if (userRole === 'mechanic') {
              if (mechanicStep !== 'login') {
                setMechanicStep('dashboard');
              } else {
                setUserRole(null);
                setMechOtpSent(false);
              }
            }
          }}>
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center border border-blue-500/30 shadow-[0_0_8px_rgba(37,99,235,0.1)]">
              {/* Core miniature brand mark */}
              <svg className="w-5.5 h-5.5" viewBox="0 0 512 512" fill="none">
                <circle cx="256" cy="256" r="130" stroke="#2563eb" strokeWidth="24" strokeDasharray="30 18" />
                <path d="M 100 350 C 130 220, 240 120, 400 120" stroke="#60a5fa" strokeWidth="32" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <span className={`text-sm font-bold tracking-tight uppercase font-sans ${textPrimary}`}>
                Otto<span className="text-blue-600">Assist</span>
              </span>
              <span className="text-[8px] text-blue-500 font-mono block tracking-widest uppercase">Lucknow • UP-32</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {userRole !== null && (
              <button
                onClick={() => {
                  setUserRole(null);
                  setOtpSent(false);
                  setMechOtpSent(false);
                  setIncomingRequest(null);
                  setMechActiveJob(null);
                }}
                className={`px-2 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 transition-all border cursor-pointer ${
                  isDark 
                    ? 'bg-red-950/20 text-red-400 border-red-900/40 hover:border-red-500/40' 
                    : 'bg-red-50 text-red-600 border-red-200 hover:border-red-300'
                }`}
                title="Log out and switch portal role"
              >
                Logout / Exit
              </button>
            )}

            {/* Elegant Manual Theme Toggler */}
            <button
              onClick={() => {
                setTheme(prev => {
                  if (prev === 'system') return 'light';
                  if (prev === 'light') return 'dark';
                  return 'system';
                });
              }}
              title={`Active theme: ${theme} (Click to toggle)`}
              className={`p-1.5 rounded-lg border transition-all flex items-center justify-center gap-1 cursor-pointer ${
                isDark 
                  ? 'bg-[#1e1e1e] text-slate-400 border-[#262626] hover:border-[#333]' 
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300 shadow-3xs'
              }`}
            >
              {theme === 'system' ? (
                <>
                  {isDark ? <Moon className="w-3.5 h-3.5 text-blue-400" /> : <Sun className="w-3.5 h-3.5 text-amber-500" />}
                  <span className="text-[8px] font-mono font-bold">SYS</span>
                </>
              ) : theme === 'dark' ? (
                <>
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-[8px] font-mono font-bold">DRK</span>
                </>
              ) : (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-[8px] font-mono font-bold">LGT</span>
                </>
              )}
            </button>

            {/* Network offline simulation toggle */}
            <button 
              onClick={() => {
                setIsOffline(!isOffline);
                if (!isOffline) {
                  setAiDiagnosis(null);
                }
              }}
              className={`px-2 py-1 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 transition-all border cursor-pointer ${
                isOffline 
                  ? 'bg-blue-600/20 text-blue-500 border-blue-500/40 shadow-[0_0_8px_rgba(37,99,235,0.15)]' 
                  : isDark
                    ? 'bg-[#1e1e1e] text-slate-400 border-[#262626] hover:border-[#333]'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              {isOffline ? <WifiOff className="w-3.5 h-3.5 text-blue-500" /> : <Wifi className="w-3.5 h-3.5 text-emerald-500" />}
              <span>{isOffline ? 'Offline' : 'Go Offline'}</span>
            </button>
          </div>
        </div>

        {/* --- MAIN APP VIEWS ROUTER --- */}
        <div className={`flex-1 overflow-hidden relative flex flex-col transition-colors duration-300 ${contentBg}`}>
          
          {/* Renders Offline Shelter if network simulation active */}
          {isOffline && currentStep !== 'completed' ? (
            <OfflineEmergency 
              onCallMechanic={handleOfflineCallMechanic}
              activeCategory={selectedCategory}
              isDark={isDark}
            />
          ) : (
            <AnimatePresence mode="wait">
              
              {/* PORTAL SELECTION SCREEN */}
              {userRole === null && (
                <motion.div
                  key="role-selection"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="flex-1 p-6 flex flex-col justify-between overflow-y-auto scrollbar-none"
                >
                  <div className="flex flex-col gap-6 items-center my-auto w-full">
                    <Logo size="lg" className="scale-[0.95] mt-2" isDark={isDark} />
                    
                    <div className="text-center max-w-xs">
                      <h2 className={`text-xs font-extrabold uppercase tracking-widest ${textPrimary}`}>
                        Lucknow Roadside Assistance
                      </h2>
                      <p className={`text-[10px] font-sans font-light mt-1.5 leading-relaxed ${textSecondary}`}>
                        OttoAssist is Lucknow's smart roadside corridor network. Select your gateway below.
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                      {/* Customer / Driver Role Card */}
                      <button
                        onClick={() => {
                          setUserRole('customer');
                          setCurrentStep('login');
                        }}
                        className={`w-full text-left rounded-2xl p-4 border flex items-center gap-3.5 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                          isDark
                            ? 'bg-[#1a1a1a] hover:bg-[#222] border-[#262626] hover:border-blue-500/50 shadow-md'
                            : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-blue-500/50 shadow-sm hover:shadow-md'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-600 shrink-0">
                          <User className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <span className={`text-[11px] font-bold uppercase tracking-wide ${textPrimary}`}>Register as Customer</span>
                            <ChevronRight className="w-3.5 h-3.5 text-blue-500" />
                          </div>
                          <p className={`text-[9px] leading-relaxed mt-0.5 ${textSecondary}`}>
                            Get rapid roadside dispatches in Lucknow, real-time tracking, and instant AI visual engine diagnostics.
                          </p>
                        </div>
                      </button>

                      {/* Mechanic / Workshop Specialist Card */}
                      <button
                        onClick={() => {
                          setUserRole('mechanic');
                          setMechanicStep('login');
                        }}
                        className={`w-full text-left rounded-2xl p-4 border flex items-center gap-3.5 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
                          isDark
                            ? 'bg-[#1a1a1a] hover:bg-[#222] border-[#262626] hover:border-emerald-500/50 shadow-md'
                            : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-emerald-500/50 shadow-sm hover:shadow-md'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-600 shrink-0">
                          <Wrench className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <span className={`text-[11px] font-bold uppercase tracking-wide ${textPrimary}`}>Register as Mechanic</span>
                            <ChevronRight className="w-3.5 h-3.5 text-emerald-500" />
                          </div>
                          <p className={`text-[9px] leading-relaxed mt-0.5 ${textSecondary}`}>
                            Configure your garage profile, accept incoming breakdown alerts, chat with motorists, and file digital invoices.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  <div className={`text-center border-t pt-3 ${isDark ? 'border-[#222]' : 'border-slate-100'}`}>
                    <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                      Lucknow Smart Fleet Portal • UP-32 Hub
                    </span>
                  </div>
                </motion.div>
              )}

              {/* CUSTOMER PORTAL FLOW */}
              {userRole === 'customer' && currentStep === 'login' && (
                <motion.div 
                  key="login"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="flex-1 p-6 flex flex-col justify-between"
                >
                  <div className="flex flex-col gap-6 items-center my-auto">
                    <Logo size="lg" className="scale-[0.95]" isDark={isDark} />
                    
                    <div className="text-center max-w-xs">
                      <p className={`text-xs font-sans font-light leading-relaxed ${textSecondary}`}>
                        Lucrative breakdown dispatches in under 15 minutes. 30 real Lucknow mechanics listed across Gomti Nagar, Lalbagh, Chinhat & highway corridors.
                      </p>
                    </div>

                    {/* Auth card panel */}
                    <div className={`w-full rounded-2xl p-4.5 flex flex-col gap-4 border transition-colors ${cardBg}`}>
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-blue-600" />
                        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Secure OTP Login</span>
                      </div>

                      {!otpSent ? (
                        <form onSubmit={handleRequestOTP} className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-slate-500">Mobile Number (India)</span>
                            <div className={`flex rounded-xl overflow-hidden border focus-within:border-blue-500 transition-colors ${inputBg}`}>
                              <span className={`px-3 py-2.5 text-xs font-mono font-semibold border-r flex items-center ${isDark ? 'text-slate-400 bg-[#1a1a1a] border-[#262626]' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>+91</span>
                              <input 
                                type="tel" 
                                required
                                maxLength={10}
                                placeholder="94512 80931"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                                className="flex-1 bg-transparent border-none focus:outline-none px-3 text-xs font-mono text-slate-800 dark:text-slate-100"
                              />
                            </div>
                          </div>

                          <button 
                            type="submit"
                            disabled={isAuthLoading || phoneNumber.length < 10}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-[0.98] cursor-pointer"
                          >
                            {isAuthLoading ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-white" />
                            ) : (
                              <>
                                <span>Get Access Token</span>
                                <ArrowRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={handleVerifyOTP} className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-widest">Verify SMS Code</span>
                              <button 
                                type="button" 
                                onClick={() => setOtpSent(false)} 
                                className="text-[9px] text-blue-600 hover:underline font-mono cursor-pointer"
                              >
                                Edit Phone
                              </button>
                            </div>
                            <div className={`rounded-xl overflow-hidden border focus-within:border-blue-500 transition-colors ${inputBg}`}>
                              <input 
                                type="password" 
                                required
                                maxLength={4}
                                placeholder="Enter 4-digit code (any code)"
                                value={otpCode}
                                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                className="w-full bg-transparent border-none focus:outline-none py-2.5 px-3 text-xs font-mono tracking-[0.6em] text-center"
                              />
                            </div>
                          </div>

                          <button 
                            type="submit"
                            disabled={isAuthLoading || !otpCode}
                            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-[0.98] cursor-pointer"
                          >
                            {isAuthLoading ? (
                              <RefreshCw className="w-4 h-4 animate-spin text-white" />
                            ) : (
                              <>
                                <CheckCircle2 className="w-4.5 h-4.5" />
                                <span>Verify and Connect</span>
                              </>
                            )}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {/* Trust Footer */}
                  <div className={`text-center border-t pt-3 ${isDark ? 'border-[#222]' : 'border-slate-100'}`}>
                    <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                      Lucknow Fleet Deployment • 32.5L registered vehicles in UP
                    </span>
                  </div>
                </motion.div>
              )}

              {/* PHASE 2: EMERGENCY DASHBOARD (LOCATE, CHOOSE ISSUE, AI DIAGNOSE, BROADCAST) */}
              {currentStep === 'dashboard' && (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col justify-between overflow-y-auto scrollbar-thin"
                >
                  <div className="p-4 flex flex-col gap-4">
                    
                    {/* Welcome Banner */}
                    <div className={`border rounded-2xl p-3 flex justify-between items-center transition-colors ${cardBg}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-600">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">Active Driver</span>
                          <span className={`text-xs font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{phoneNumber ? `+91 ${phoneNumber}` : '+91 94512 80931'}</span>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider block">Zone</span>
                        <span className="text-[10px] text-blue-600 font-mono font-bold">Lucknow UP-32</span>
                      </div>
                    </div>

                    {/* GPS Location Panel */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <label className={`text-[10px] uppercase font-mono font-bold tracking-wider flex items-center gap-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                          <MapPin className="w-3.5 h-3.5 text-blue-600" />
                          <span>Stranded Location</span>
                        </label>
                        <button 
                          onClick={handleDetectLocation}
                          disabled={isLocating}
                          className={`text-[10px] font-mono flex items-center gap-1 border px-2 py-0.5 rounded-lg cursor-pointer transition-colors ${
                            isDark 
                              ? 'bg-[#1a1a1a] text-blue-400 border-[#262626] hover:border-[#333]' 
                              : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                          }`}
                        >
                          <RefreshCw className={`w-3 h-3 ${isLocating ? 'animate-spin' : ''}`} />
                          <span>Auto GPS</span>
                        </button>
                      </div>

                      <div className={`border focus-within:border-blue-500 rounded-xl p-2.5 transition-colors flex items-start gap-2 ${inputBg}`}>
                        <textarea 
                          rows={2}
                          value={driverAddress}
                          onChange={(e) => setDriverAddress(e.target.value)}
                          className="flex-1 bg-transparent border-none focus:outline-none text-xs resize-none leading-relaxed text-slate-800 dark:text-slate-100"
                          placeholder="Detecting your breakdown coordinate point..."
                        />
                      </div>
                    </div>

                    {/* Issue Category Grid */}
                    <div className="flex flex-col gap-1.5">
                      <span className={`text-[10px] uppercase font-mono font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Select Breakdown Category</span>
                      <div className="grid grid-cols-5 gap-2">
                        {(['Tyre', 'Battery', 'Engine', 'Overheating', 'Other'] as IssueCategory[]).map((cat) => {
                          const isSelected = selectedCategory === cat;
                          return (
                            <button
                              key={cat}
                              onClick={() => {
                                setSelectedCategory(cat);
                                setAiDiagnosis(null); // Clear old AI context on switch
                                setUploadedPhotos([]);
                              }}
                              className={`py-2 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all active:scale-95 cursor-pointer ${
                                isSelected 
                                  ? 'bg-blue-500/10 text-blue-600 border-2 border-blue-500 shadow-[0_0_12px_rgba(37,99,235,0.15)]' 
                                  : isDark
                                    ? 'bg-[#1a1a1a] text-slate-400 border-[#262626] hover:border-[#333]'
                                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <Wrench className={`w-4 h-4 ${isSelected ? 'scale-110 text-blue-600' : ''}`} />
                              <span className="text-[9px] font-mono font-bold uppercase tracking-wider">{cat}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Description & Photo Section */}
                    <div className={`border rounded-2xl p-3 flex flex-col gap-3 transition-colors ${isDark ? 'bg-[#1a1a1a]/50 border-[#262626]/40' : 'bg-slate-50/50 border-slate-200/60'}`}>
                      
                      {/* Photo Upload section */}
                      <div className="flex justify-between items-center">
                        <span className={`text-[10px] uppercase font-mono font-bold tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          Damage Photos (Limit 10)
                        </span>
                        <span className="text-[9px] font-mono text-slate-500 font-bold">
                          {uploadedPhotos.length} / 10
                        </span>
                      </div>

                      {/* Flex horizontal list of photos */}
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap gap-2 items-center">
                          {uploadedPhotos.map((photo, index) => (
                            <div key={index} className={`relative w-16 h-16 rounded-xl overflow-hidden border group shrink-0 ${isDark ? 'border-[#262626]' : 'border-slate-200'}`}>
                              <img src={photo} alt={`Damage ${index + 1}`} className="w-full h-full object-cover" />
                              <button 
                                onClick={() => setUploadedPhotos(prev => prev.filter((_, i) => i !== index))} 
                                className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-600/90 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-[8px] font-bold cursor-pointer"
                                title="Remove photo"
                              >
                                &times;
                              </button>
                              <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[7px] text-center py-0.5 font-mono">
                                #{index + 1}
                              </span>
                            </div>
                          ))}

                          {uploadedPhotos.length < 10 && (
                            <button
                              onClick={triggerFileInput}
                              className={`w-16 h-16 border border-dashed rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors shrink-0 ${
                                isDark 
                                  ? 'border-[#262626] hover:border-blue-500 bg-[#121212]/30 text-slate-500 hover:text-blue-400' 
                                  : 'border-slate-300 hover:border-blue-600 bg-slate-50 hover:bg-blue-50/50 text-slate-500 hover:text-blue-600'
                              }`}
                            >
                              <Camera className="w-4 h-4" />
                              <span className="text-[8px] font-sans">Add</span>
                            </button>
                          )}
                        </div>

                        {/* File upload helpers */}
                        <input 
                          type="file" 
                          ref={fileInputRef} 
                          accept="image/*" 
                          multiple 
                          onChange={handleFileChange} 
                          className="hidden" 
                        />

                        {/* Import helper action buttons */}
                        <div className="flex items-center gap-2 mt-1">
                          <button 
                            onClick={handleAddMockPhoto}
                            disabled={uploadedPhotos.length >= 10}
                            className={`text-[9px] font-mono px-2.5 py-1 rounded-lg cursor-pointer transition-all border ${
                              isDark 
                                ? 'text-blue-400 border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/15 disabled:opacity-40' 
                                : 'text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 disabled:opacity-40 shadow-3xs'
                            }`}
                          >
                            + Mock Photo ({uploadedPhotos.length}/10)
                          </button>
                          
                          <button 
                            onClick={() => setShowMobileImportModal(true)}
                            className={`text-[9px] font-mono px-2.5 py-1 rounded-lg cursor-pointer transition-all border ${
                              isDark 
                                ? 'text-blue-400 border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/15' 
                                : 'text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100 shadow-3xs'
                            }`}
                          >
                            📱 Import from Mobile via QR
                          </button>
                        </div>
                      </div>

                      {/* Symptoms Input */}
                      <div className="flex flex-col gap-1 mt-1">
                        <span className={`text-[10px] uppercase font-mono font-bold tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Describe Symptoms</span>
                        <input 
                          type="text"
                          value={issueDescription}
                          onChange={(e) => setIssueDescription(e.target.value)}
                          placeholder="e.g. Nails in front tyre, or smoke from engine bay..."
                          className={`w-full focus:outline-none rounded-xl py-2 px-3 text-xs transition-colors focus:border-blue-500 ${inputBg}`}
                        />
                      </div>

                      {/* GET AI DIAGNOSIS TRIGGER */}
                      <button
                        onClick={handleGetAIDiagnosis}
                        disabled={isDiagnosing}
                        className={`w-full border font-mono font-bold text-[10px] py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all active:scale-95 uppercase tracking-wider cursor-pointer ${
                          isDark 
                            ? 'bg-[#121212] hover:bg-[#1a1a1a] border-[#262626] text-blue-400 hover:text-blue-300' 
                            : 'bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700'
                        }`}
                      >
                        <Sparkles className={`w-3.5 h-3.5 ${isDiagnosing ? 'animate-spin' : ''}`} />
                        <span>{isDiagnosing ? 'Otto is analyzing...' : 'Run Otto AI Diagnostician'}</span>
                      </button>
                    </div>

                    {/* AI DIAGNOSIS LOG CARD */}
                    {aiDiagnosis && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`border rounded-2xl p-3.5 flex flex-col gap-3 transition-colors ${
                          isDark 
                            ? 'bg-[#1a1a1a] border-blue-500/30 shadow-[0_0_20px_rgba(37,99,235,0.08)]' 
                            : 'bg-blue-50/50 border-blue-300 shadow-xs'
                        }`}
                      >
                        <div className={`flex justify-between items-center pb-2 border-b ${isDark ? 'border-[#262626]/60' : 'border-blue-200'}`}>
                          <div className="flex items-center gap-1 text-blue-600">
                            <Sparkles className="w-4 h-4 animate-pulse" />
                            <span className="text-[11px] font-bold uppercase tracking-wider font-mono">Otto AI Diagnosis</span>
                          </div>

                          <span className={`text-[8px] uppercase tracking-wider font-mono px-2 py-0.5 rounded font-bold ${
                            aiDiagnosis.severity === 'Critical' ? 'bg-red-950/20 text-red-500 border border-red-500/40' :
                            aiDiagnosis.severity === 'High' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                            'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                          }`}>
                            {aiDiagnosis.severity} Risk
                          </span>
                        </div>

                        <div className="flex flex-col gap-1.5 text-xs">
                          <div>
                            <span className="text-[8px] text-slate-500 uppercase font-mono tracking-widest block">Primary Suspect</span>
                            <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{aiDiagnosis.issue}</span>
                          </div>

                          <div>
                            <span className="text-[8px] text-slate-500 uppercase font-mono tracking-widest block">Mechanical Cause</span>
                            <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{aiDiagnosis.likelyCause}</p>
                          </div>

                          <div className={`border rounded-lg p-2 flex items-start gap-2 ${isDark ? 'bg-red-950/10 border-red-900/30' : 'bg-red-50 border-red-200'}`}>
                            <AlertCircle className="w-4.5 h-4.5 text-red-500 shrink-0 mt-0.5" />
                            <div className="flex flex-col">
                              <span className="text-[8px] text-red-600 uppercase font-mono font-bold tracking-wider">Urgent Safety Precaution</span>
                              <p className={`text-[10px] leading-snug ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{aiDiagnosis.recommendedAction}</p>
                            </div>
                          </div>

                          <div className={`grid grid-cols-2 gap-3 pt-1 mt-1 border-t ${isDark ? 'border-[#262626]/50' : 'border-blue-200'}`}>
                            <div>
                              <span className="text-[8px] text-slate-500 uppercase font-mono tracking-widest block">Est. Cost Range</span>
                              <span className="text-emerald-600 font-mono font-bold text-xs">{aiDiagnosis.estCostRange}</span>
                            </div>
                            <div>
                              <span className="text-[8px] text-slate-500 uppercase font-mono tracking-widest block">Recommended Parts</span>
                              <span className={`text-[10px] font-mono truncate block ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                {aiDiagnosis.suggestedParts.join(', ')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}

                  </div>

                  {/* BOTTOM ACTION RAIL: ONE TAP SOS DISPATCH */}
                  <div className={`p-4 border-t shrink-0 ${isDark ? 'bg-[#1a1a1a]/90 border-[#262626]' : 'bg-slate-50 border-slate-200/80'}`}>
                    <button 
                      onClick={handleTriggerSOS}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black uppercase text-sm py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-blue-600/25 cursor-pointer"
                    >
                      <Sparkles className="w-5 h-5 text-white" />
                      <span>One-Tap SOS Dispatch</span>
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </button>
                    
                    <span className="text-[8px] font-mono text-slate-500 text-center block mt-2 uppercase tracking-wider">
                      Locks upfront quotes to the 3 nearest available Lucknow mechanics simultaneously
                    </span>
                  </div>
                </motion.div>
              )}

              {/* PHASE 3: SOS BROADCASTING ANIMATION */}
              {currentStep === 'broadcasting' && (
                <motion.div 
                  key="broadcasting"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 p-6 flex flex-col justify-between items-center text-center my-auto"
                >
                  <div className="flex flex-col items-center gap-6 my-auto">
                    {/* Pulsating emergency radar */}
                    <div className="relative w-28 h-28 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full bg-blue-500/10 border border-blue-500/30 animate-ping" />
                      <div className="absolute inset-4 rounded-full bg-blue-500/20 border border-blue-500/40 animate-ping [animation-delay:0.5s]" />
                      <div className="absolute inset-8 rounded-full bg-blue-500/30 border border-blue-500/50 animate-pulse" />
                      <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/30">
                        <Wrench className="w-7 h-7 text-white animate-spin-slow" />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <h3 className={`text-base font-bold uppercase tracking-wider ${textPrimary}`}>Broadcasting Emergency</h3>
                      <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                        Connecting to the 3 nearest Lucknow mechanics surrounding your breakdown vector on Faizabad Road.
                      </p>
                    </div>

                    {/* Show targeted mechanics receiving broadcast */}
                    <div className={`w-full max-w-xs rounded-2xl p-4 flex flex-col gap-2.5 text-left border ${cardBg}`}>
                      <span className="text-[8px] text-slate-500 font-mono uppercase tracking-widest block">Receiving Dispatches</span>
                      
                      {closestGarages.map((garage, idx) => (
                        <div key={garage.id} className="flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 font-mono">0{idx+1}.</span>
                            <span className={`font-medium truncate max-w-[150px] ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{garage.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-blue-600 font-bold">{garage.distance} km</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className={`w-full max-w-xs h-2 rounded-full overflow-hidden ${isDark ? 'bg-[#1a1a1a]' : 'bg-slate-100'}`}>
                    <div 
                      className="bg-blue-600 h-full transition-all duration-300"
                      style={{ width: `${broadcastProgress}%` }}
                    />
                  </div>
                </motion.div>
              )}

              {/* PHASE 4: LIVE DISPATCH TRACKING & IN-APP CHAT */}
              {currentStep === 'tracking' && matchedMechanic && (
                <motion.div 
                  key="tracking"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col justify-between overflow-hidden"
                >
                  {/* Dynamic tracking map widget */}
                  <LucknowMap 
                    driverCoords={driverCoords}
                    driverAddress={driverAddress}
                    selectedMechanic={matchedMechanic}
                    isDispatching={isDispatching}
                    onArrived={handleMechanicArrived}
                    isOffline={isOffline}
                    isDark={isDark}
                  />

                  {/* Mechanic Bio Card */}
                  <div className={`p-3.5 flex justify-between items-center border-b shrink-0 ${cardBg}`}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                        <Wrench className="w-5.5 h-5.5 text-blue-600" />
                      </div>
                      
                      <div className="flex flex-col">
                        <h4 className={`text-xs font-bold truncate max-w-[170px] ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{matchedMechanic.name}</h4>
                        <div className="flex items-center gap-1.5 text-[9px] font-mono">
                          <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          <span className="text-slate-500">{matchedMechanic.rating} Rating</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-blue-600 uppercase font-bold tracking-wider">MRI Score: {matchedMechanic.mri}</span>
                        </div>
                      </div>
                    </div>

                    <a 
                      href={`tel:${matchedMechanic.phone.replace(/\s+/g, '')}`}
                      className="w-9 h-9 rounded-xl bg-emerald-500 hover:bg-emerald-400 flex items-center justify-center text-white shadow-md cursor-pointer transition-transform active:scale-95"
                    >
                      <Phone className="w-4.5 h-4.5 text-white" />
                    </a>
                  </div>

                  {/* Live Chat Box */}
                  <div className={`flex-1 p-3 overflow-y-auto flex flex-col gap-2.5 scrollbar-thin transition-colors ${isDark ? 'bg-[#121212]' : 'bg-white'}`} ref={chatScrollRef}>
                    <div className="text-center my-1">
                      <span className={`text-[8px] border px-2 py-0.5 rounded font-mono uppercase tracking-widest ${isDark ? 'bg-[#1a1a1a] border-[#262626]/50 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                        End-to-End Encrypted Tunnel
                      </span>
                    </div>

                    {chatMessages.map((msg) => {
                      if (msg.sender === 'system') {
                        return (
                          <div key={msg.id} className="text-center my-0.5">
                            <span className="text-[9px] text-slate-500 font-mono italic">{msg.text}</span>
                          </div>
                        );
                      }
                      
                      const isMe = msg.sender === 'driver';
                      return (
                        <div 
                          key={msg.id} 
                          className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                        >
                          <div className={`px-3 py-2 rounded-xl text-xs ${
                            isMe 
                              ? 'bg-blue-600 text-white font-semibold rounded-tr-none' 
                              : isDark 
                                ? 'bg-[#1a1a1a] text-slate-200 rounded-tl-none border border-[#262626]'
                                : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                          }`}>
                            <p className="leading-relaxed">{msg.text}</p>
                          </div>
                          <span className="text-[7px] text-slate-500 font-mono mt-0.5">{msg.timestamp}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Chat Input Field / Action bar */}
                  <div className={`p-3 border-t flex flex-col gap-3 shrink-0 ${cardBg}`}>
                    
                    <form onSubmit={handleSendUserMessage} className="flex gap-2">
                      <input 
                        type="text"
                        value={userMessageText}
                        onChange={(e) => setUserMessageText(e.target.value)}
                        placeholder="Message mechanic..."
                        className={`flex-1 focus:outline-none rounded-xl py-2 px-3 text-xs transition-colors focus:border-blue-500 ${inputBg}`}
                      />
                      <button 
                        type="submit" 
                        className="bg-blue-600 hover:bg-blue-700 text-white w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95 shadow-md shadow-blue-500/10"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>

                    {/* Finish Repair Operations */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleMarkJobCompleted}
                        disabled={isPaymentProcessing}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95"
                      >
                        {isPaymentProcessing ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="w-4.5 h-4.5" />
                            <span>Mark Repair Completed</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* PHASE 4.5: SECURE UPI PAYMENT SPLIT GATE */}
              {currentStep === 'payment' && generatedReceipt && (
                <motion.div
                  key="payment-gate"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="flex-1 p-4 flex flex-col justify-between overflow-y-auto scrollbar-thin animate-fadeIn"
                >
                  <div className="flex flex-col gap-4">
                    {/* Header */}
                    <div className="text-center py-1 flex flex-col items-center gap-1">
                      <div className="w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-600 animate-bounce">
                        <QrCode className="w-5.5 h-5.5" />
                      </div>
                      <h3 className={`text-xs font-bold uppercase tracking-wider ${textPrimary}`}>Dynamic UPI Split Invoice</h3>
                      <p className="text-[9px] text-slate-500 font-mono">Invoice Ref: #{generatedReceipt.invoiceId}</p>
                    </div>

                    {/* Breakdown Card */}
                    <div className={`border rounded-2xl p-3.5 flex flex-col gap-2.5 transition-colors ${cardBg}`}>
                      <div className="flex justify-between items-center pb-2 border-b dark:border-[#262626] border-slate-200">
                        <span className={`text-[10px] font-mono font-bold uppercase ${textSecondary}`}>Service Items</span>
                        <span className="text-[10px] font-bold text-blue-500">{generatedReceipt.garageName}</span>
                      </div>
                      <div className="flex flex-col gap-1.5 text-[10px] font-mono">
                        <div className="flex justify-between text-slate-500">
                          <span>Emergency Callout Fee:</span>
                          <span className={textPrimary}>₹{generatedReceipt.baseFee}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Labor Repairs:</span>
                          <span className={textPrimary}>₹{generatedReceipt.serviceFee}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Spare Parts / Consumables:</span>
                          <span className={textPrimary}>₹{generatedReceipt.partsFee}</span>
                        </div>
                        <div className={`pt-2 border-t dark:border-[#222] border-slate-100 flex justify-between text-xs font-bold`}>
                          <span className={textPrimary}>Total Due:</span>
                          <span className="text-blue-600 text-sm">₹{generatedReceipt.totalFee}</span>
                        </div>
                      </div>
                    </div>

                    {/* DUAL SPLIT ROUTING LEDGER */}
                    <div className={`border rounded-2xl p-4 flex flex-col gap-3 transition-colors ${isDark ? 'bg-[#0a0a0a] border-amber-500/15' : 'bg-amber-500/5 border-amber-500/20'}`}>
                      <div className="flex items-center gap-1.5 pb-1 border-b border-dashed dark:border-neutral-800 border-slate-200">
                        <Info className="w-3.5 h-3.5 text-amber-500" />
                        <span className="text-[9px] uppercase font-mono font-extrabold text-amber-500 tracking-wider">Automated Revenue Split (10/90)</span>
                      </div>

                      <div className="flex flex-col gap-2">
                        {/* Platform App Part */}
                        <div className="flex justify-between items-start text-[10px]">
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-bold flex items-center gap-1 ${textPrimary}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                              OttoAssist Platform Commission (10%)
                            </span>
                            <span className="text-[8px] text-slate-500 font-mono">Retained for roadside grid operations</span>
                          </div>
                          <span className="font-mono font-extrabold text-blue-500">₹{generatedReceipt.platformFee || Math.round(generatedReceipt.totalFee * 0.1)}</span>
                        </div>

                        {/* Divider Line */}
                        <div className="h-[1px] bg-dashed dark:bg-neutral-800 bg-slate-200 border-t border-dashed" />

                        {/* Mechanic part */}
                        <div className="flex justify-between items-start text-[10px]">
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-bold flex items-center gap-1 ${textPrimary}`}>
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Partner Mechanic Settlement (90%)
                            </span>
                            <span className="text-[8px] text-slate-500 font-mono text-left">Credited to {generatedReceipt.mechanicBankDetails || `${generatedReceipt.garageName} UPI`}</span>
                          </div>
                          <span className="font-mono font-extrabold text-emerald-500">₹{generatedReceipt.mechanicFee || (generatedReceipt.totalFee - Math.round(generatedReceipt.totalFee * 0.1))}</span>
                        </div>
                      </div>
                    </div>

                    {/* QR Code Container */}
                    <div className={`border rounded-2xl p-4 flex flex-col items-center gap-3 ${cardBg}`}>
                      <span className={`text-[9px] font-mono uppercase tracking-widest ${textSecondary}`}>Scan to Settle via BHIM UPI</span>
                      
                      <div className="relative p-2 bg-white rounded-xl shadow-md border border-slate-200 flex items-center justify-center">
                        {/* Decorative scanning red laser line */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-red-500 opacity-60 animate-bounce" />
                        
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                            `upi://pay?pa=${matchedMechanic?.id === 'self_mech' ? mechUpiId : 'partner.up32@okaxis'}&pn=${encodeURIComponent(generatedReceipt.garageName)}&am=${generatedReceipt.totalFee}&tn=OttoAssist_Invoice_${generatedReceipt.invoiceId}&cu=INR`
                          )}`} 
                          alt="BHIM UPI Split Payment QR"
                          className="w-36 h-36"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      
                      <div className="flex items-center gap-1.5 text-slate-500 font-mono text-[8px] uppercase">
                        <span>BHIM</span> • <span>GPay</span> • <span>PhonePe</span> • <span>Paytm</span>
                      </div>
                    </div>

                    {/* Simulate Verification Button */}
                    <div className="flex flex-col gap-1.5">
                      <button
                        onClick={() => {
                          setIsPaymentProcessing(true);
                          setTimeout(() => {
                            setIsPaymentProcessing(false);
                            setPaymentDone(true);
                            // Settle payout immediately in mechanic earnings if matched to logged in mechanic!
                            if (matchedMechanic?.id === 'self_mech') {
                              const cred = generatedReceipt.mechanicFee || (generatedReceipt.totalFee - Math.round(generatedReceipt.totalFee * 0.1));
                              setMechEarnings(prev => prev + cred);
                              setMechCompletedCount(prev => prev + 1);
                            }
                            // Move step to complete
                            setCurrentStep('completed');
                          }, 1500);
                        }}
                        disabled={isPaymentProcessing}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95"
                      >
                        {isPaymentProcessing ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Verify UPI Payment Success</span>
                          </>
                        )}
                      </button>
                      <span className="text-[7px] text-slate-500 font-mono text-center block">Settle split transaction instantly on the Lucknow smart mechanic mesh.</span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* PHASE 5: DIGITAL INVOICE RECEIPT & WARRANTY SHEET */}
              {currentStep === 'completed' && generatedReceipt && (
                <motion.div 
                  key="completed"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 p-4 flex flex-col justify-between overflow-y-auto"
                >
                  <div className="flex flex-col gap-4">
                    
                    {/* Header Seal */}
                    <div className="text-center py-2 flex flex-col items-center gap-1.5">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600">
                        <CheckCircle2 className="w-7 h-7" />
                      </div>
                      <h3 className={`text-sm font-bold uppercase tracking-wider ${textPrimary}`}>Breakdown Service Complete</h3>
                      <p className="text-[10px] text-slate-500 font-mono">Invoice #{generatedReceipt.invoiceId} generated successfully</p>
                    </div>

                    {/* Real-time Invoice Details Card */}
                    <div className={`border rounded-2xl p-4 flex flex-col gap-3.5 transition-colors ${cardBg}`}>
                      <div className={`flex justify-between items-center pb-2.5 border-b ${isDark ? 'border-[#262626]' : 'border-slate-200'}`}>
                        <span className={`text-xs font-bold ${textPrimary}`}>Payment Summary</span>
                        <span className="text-[9px] font-mono text-emerald-600 uppercase bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                          Paid via BHIM UPI
                        </span>
                      </div>

                      {/* Info lines */}
                      <div className="flex flex-col gap-2.5 text-[11px] font-sans">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Service Provider:</span>
                          <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{generatedReceipt.garageName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Provider Phone:</span>
                          <span className="text-slate-400 font-mono">{generatedReceipt.garagePhone}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Assistance Category:</span>
                          <span className="text-blue-600 font-mono uppercase font-bold">{generatedReceipt.issueCategory}</span>
                        </div>
                        <div className="flex justify-between items-start">
                          <span className="text-slate-500 shrink-0">Site Address:</span>
                          <span className={`text-right truncate max-w-[180px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{generatedReceipt.location}</span>
                        </div>
                      </div>

                      {/* Fee Breakdown */}
                      <div className={`pt-2.5 flex flex-col gap-2 font-mono text-[10px] border-t ${isDark ? 'border-[#262626]' : 'border-slate-200'}`}>
                        <div className="flex justify-between text-slate-500">
                          <span>Emergency Callout Fee:</span>
                          <span>₹{generatedReceipt.baseFee.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Labor Service Fee:</span>
                          <span>₹{generatedReceipt.serviceFee.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Replacement Parts:</span>
                          <span>₹{generatedReceipt.partsFee.toLocaleString()}</span>
                        </div>
                         <div className={`text-xs font-bold pt-1.5 border-t flex justify-between ${isDark ? 'border-[#262626]/40' : 'border-slate-200'}`}>
                          <span className={textPrimary}>TOTAL CHARGE:</span>
                          <span className="text-blue-600 text-sm">₹{generatedReceipt.totalFee.toLocaleString()}</span>
                        </div>
                        {/* Split details shown transparently on invoice */}
                        <div className="mt-2 p-2.5 rounded-xl bg-slate-500/5 border border-dashed border-slate-500/20 text-[9px] flex flex-col gap-1 text-slate-400">
                          <div className="flex justify-between font-mono">
                            <span className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-blue-500" />
                              Platform Fee (10% retained):
                            </span>
                            <span>₹{(generatedReceipt.platformFee || Math.round(generatedReceipt.totalFee * 0.1)).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between font-mono">
                            <span className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-emerald-500" />
                              Direct Settlement to Mechanic (90%):
                            </span>
                            <span className="text-emerald-500 font-extrabold">₹{(generatedReceipt.mechanicFee || (generatedReceipt.totalFee - Math.round(generatedReceipt.totalFee * 0.1))).toLocaleString()}</span>
                          </div>
                          <div className="text-[7.5px] mt-1 text-slate-500 text-center font-sans">
                            Paid on UPI. Settlement Destination: {generatedReceipt.mechanicBankDetails || "Partner Bank A/c"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Official Warranty Stamp Panel */}
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4 flex gap-3 items-center">
                      <Award className="w-8 h-8 text-blue-600 shrink-0" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-600">Verified Service Warranty</span>
                        <p className="text-[10px] text-slate-500 leading-relaxed">
                          This completed dispatch has been secured by a verified, mechanic-flagged <strong className="text-blue-600">{generatedReceipt.warrantyPeriod}</strong> valid across all 75 UP districts.
                        </p>
                      </div>
                    </div>

                    {/* Download PDF block */}
                    <button
                      onClick={handleDownloadInvoice}
                      disabled={isDownloading}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/10 cursor-pointer transition-all"
                    >
                      {isDownloading ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <>
                          <Download className="w-4.5 h-4.5" />
                          <span>Download Digital Receipt (PDF)</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-[#121212] flex gap-2">
                    <button
                      onClick={() => {
                        // Reset flow to home
                        setAiDiagnosis(null);
                        setIssueDescription('');
                        setUploadedPhotos([]);
                        setGeneratedReceipt(null);
                        setCurrentStep('dashboard');
                      }}
                      className={`w-full border font-mono text-[10px] py-2.5 rounded-xl uppercase tracking-wider active:scale-95 transition-transform cursor-pointer ${
                        isDark 
                          ? 'bg-[#1a1a1a] border-[#262626] hover:border-[#333] text-slate-300' 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      New SOS Callout
                    </button>
                  </div>
                </motion.div>
              )}

              {/* MECHANIC PORTAL FLOW */}

              {/* STEP 1: LOGIN/REGISTER */}
              {userRole === 'mechanic' && mechanicStep === 'login' && (
                <motion.div
                  key="mech-login"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="flex-1 p-6 flex flex-col justify-between"
                >
                  <div className="flex flex-col gap-6 items-center my-auto w-full">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 border-2 border-emerald-500/20 flex items-center justify-center text-emerald-600 shadow-sm">
                      <Wrench className="w-8 h-8" />
                    </div>

                    <div className="text-center max-w-xs">
                      <h2 className={`text-sm font-bold uppercase tracking-wider ${textPrimary}`}>
                        Mechanic Partner Login
                      </h2>
                      <p className={`text-[10px] font-sans font-light mt-1.5 leading-relaxed ${textSecondary}`}>
                        Access the Lucknow smart mechanic grid. Provide your registered contact number to retrieve alerts.
                      </p>
                    </div>

                    {/* Auth panel */}
                    <div className={`w-full rounded-2xl p-4.5 flex flex-col gap-4 border transition-colors ${cardBg}`}>
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-emerald-500" />
                        <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Secure Partner OTP</span>
                      </div>

                      {!mechOtpSent ? (
                        <form onSubmit={handleRequestMechOTP} className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1.5">
                            <label className={`text-[9px] uppercase font-mono tracking-wider ${textSecondary}`}>Mobile Connection Number</label>
                            <div className="flex">
                              <span className={`inline-flex items-center px-3 rounded-l-xl border-y border-l font-mono text-xs ${isDark ? 'bg-slate-900 border-[#262626] text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>+91</span>
                              <input 
                                type="tel"
                                maxLength={10}
                                placeholder="70072 11984"
                                value={mechPhone}
                                onChange={(e) => setMechPhone(e.target.value.replace(/\D/g, ''))}
                                className={`flex-1 focus:outline-none rounded-r-xl py-2.5 px-3 text-xs border-y border-r transition-colors focus:border-emerald-500 ${inputBg}`}
                                required
                              />
                            </div>
                          </div>

                          <button 
                            type="submit"
                            disabled={mechIsLoading || mechPhone.length < 10}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95"
                          >
                            {mechIsLoading ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <span>Request Credentials</span>
                                <ArrowRight className="w-4 h-4" />
                              </>
                            )}
                          </button>
                        </form>
                      ) : (
                        <form onSubmit={handleVerifyMechOTP} className="flex flex-col gap-3.5">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex justify-between items-center">
                              <label className={`text-[9px] uppercase font-mono tracking-wider ${textSecondary}`}>Enter 6-Digit SMS PIN</label>
                              <button 
                                type="button" 
                                onClick={() => setMechOtpSent(false)}
                                className="text-[9px] text-emerald-500 font-mono hover:underline"
                              >
                                Change Phone
                              </button>
                            </div>
                            <input 
                              type="text"
                              maxLength={6}
                              placeholder="128490"
                              value={mechOtpCode}
                              onChange={(e) => setMechOtpCode(e.target.value.replace(/\D/g, ''))}
                              className={`focus:outline-none rounded-xl py-2.5 px-3 text-center text-sm font-mono tracking-widest border transition-colors focus:border-emerald-500 ${inputBg}`}
                              required
                            />
                            <span className="text-[8px] text-slate-500 font-mono text-center block mt-1">Simulated SMS sent. Enter any code to proceed.</span>
                          </div>

                          <button 
                            type="submit"
                            disabled={mechIsLoading || !mechOtpCode}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95"
                          >
                            {mechIsLoading ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 className="w-4 h-4" />
                                <span>Verify and Connect</span>
                              </>
                            )}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {/* Trust Footer */}
                  <div className={`text-center border-t pt-3 ${isDark ? 'border-[#222]' : 'border-slate-100'}`}>
                    <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">
                      Lucknow Mechanics Alliance • 75 Districts Certified
                    </span>
                  </div>
                </motion.div>
              )}

              {/* STEP 2: PROFILE SETUP */}
              {userRole === 'mechanic' && mechanicStep === 'setup' && (
                <motion.div
                  key="mech-setup"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 p-5 flex flex-col justify-between overflow-y-auto scrollbar-thin"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                        <User className="w-4 h-4" />
                      </div>
                      <h3 className={`text-xs font-bold uppercase tracking-wider ${textPrimary}`}>Configure Workshop Details</h3>
                    </div>

                    <div className="flex flex-col gap-3">
                      {/* Name */}
                      <div className="flex flex-col gap-1">
                        <label className={`text-[9px] uppercase font-mono tracking-wider ${textSecondary}`}>Garage/Workshop Name</label>
                        <input
                          type="text"
                          value={mechName}
                          onChange={(e) => setMechName(e.target.value)}
                          className={`focus:outline-none rounded-xl py-2 px-3 text-xs border transition-colors focus:border-emerald-500 ${inputBg}`}
                          placeholder="e.g. Hazratganj Wizards"
                          required
                        />
                      </div>

                      {/* Contact */}
                      <div className="flex flex-col gap-1">
                        <label className={`text-[9px] uppercase font-mono tracking-wider ${textSecondary}`}>Public Contact Number</label>
                        <input
                          type="text"
                          value={mechContact}
                          onChange={(e) => setMechContact(e.target.value)}
                          className={`focus:outline-none rounded-xl py-2 px-3 text-xs border transition-colors focus:border-emerald-500 ${inputBg}`}
                          placeholder="e.g. 7007211984"
                          required
                        />
                      </div>

                      {/* Region Neighborhood */}
                      <div className="flex flex-col gap-1">
                        <label className={`text-[9px] uppercase font-mono tracking-wider ${textSecondary}`}>Active Operating Hub</label>
                        <select
                          value={mechNeighborhood}
                          onChange={(e) => setMechNeighborhood(e.target.value)}
                          className={`focus:outline-none rounded-xl py-2 px-3 text-xs border transition-colors focus:border-emerald-500 ${inputBg}`}
                        >
                          <option value="Hazratganj">Hazratganj Corridors</option>
                          <option value="Gomti Nagar">Gomti Nagar Extension</option>
                          <option value="Lalbagh">Lalbagh Market Center</option>
                          <option value="Chinhat">Chinhat Highway Junction</option>
                          <option value="Indira Nagar">Indira Nagar Ring Road</option>
                          <option value="Alambagh">Alambagh Bypass</option>
                          <option value="Transport Nagar">Transport Nagar Hub</option>
                        </select>
                      </div>

                      {/* Pricing */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                          <label className={`text-[8px] uppercase font-mono tracking-wider ${textSecondary}`}>Base Dispatch (₹)</label>
                          <input
                            type="number"
                            value={mechBaseFee}
                            onChange={(e) => setMechBaseFee(Number(e.target.value))}
                            className={`focus:outline-none rounded-xl py-2 px-3 text-xs border transition-colors focus:border-emerald-500 ${inputBg}`}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className={`text-[8px] uppercase font-mono tracking-wider ${textSecondary}`}>Labor Service (₹)</label>
                          <input
                            type="number"
                            value={mechServiceFee}
                            onChange={(e) => setMechServiceFee(Number(e.target.value))}
                            className={`focus:outline-none rounded-xl py-2 px-3 text-xs border transition-colors focus:border-emerald-500 ${inputBg}`}
                          />
                        </div>
                      </div>

                      {/* Bank Details section */}
                      <div className={`p-3 rounded-2xl border border-dashed flex flex-col gap-2.5 ${isDark ? 'border-[#262626] bg-[#0c0c0c]' : 'border-slate-200 bg-slate-50'}`}>
                        <div className="flex items-center gap-1.5 pb-1 border-b dark:border-[#1a1a1a] border-slate-200">
                          <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
                          <span className={`text-[9px] uppercase font-mono font-bold tracking-wider ${textSecondary}`}>Verified Settlement Account</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1 col-span-2">
                            <label className={`text-[8px] uppercase font-mono tracking-wider ${textSecondary}`}>Mechanic UPI ID (For Split Transfer)</label>
                            <input
                              type="text"
                              value={mechUpiId}
                              onChange={(e) => setMechUpiId(e.target.value)}
                              placeholder="e.g. name@okaxis"
                              className={`focus:outline-none rounded-xl py-2 px-3 text-xs border transition-colors focus:border-emerald-500 ${inputBg}`}
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={`text-[8px] uppercase font-mono tracking-wider ${textSecondary}`}>Bank Name</label>
                            <input
                              type="text"
                              value={mechBankName}
                              onChange={(e) => setMechBankName(e.target.value)}
                              placeholder="e.g. SBI, HDFC, ICICI"
                              className={`focus:outline-none rounded-xl py-2 px-3 text-xs border transition-colors focus:border-emerald-500 ${inputBg}`}
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className={`text-[8px] uppercase font-mono tracking-wider ${textSecondary}`}>IFSC Code</label>
                            <input
                              type="text"
                              value={mechIfscCode}
                              onChange={(e) => setMechIfscCode(e.target.value.toUpperCase())}
                              placeholder="e.g. SBIN0000123"
                              className={`focus:outline-none rounded-xl py-2 px-3 text-xs border transition-colors focus:border-emerald-500 ${inputBg}`}
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-1 col-span-2">
                            <label className={`text-[8px] uppercase font-mono tracking-wider ${textSecondary}`}>Bank Account Number</label>
                            <input
                              type="text"
                              value={mechBankAccount}
                              onChange={(e) => setMechBankAccount(e.target.value.replace(/\D/g, ''))}
                              placeholder="e.g. 987654321099"
                              className={`focus:outline-none rounded-xl py-2 px-3 text-xs border transition-colors focus:border-emerald-500 ${inputBg}`}
                              required
                            />
                          </div>
                        </div>
                        <span className="text-[7px] text-slate-500 font-mono text-center">90% of all customer payments settle directly to this account via dual-split UPI routing.</span>
                      </div>

                      {/* Specialties / Service Range */}
                      <div className="flex flex-col gap-1.5">
                        <label className={`text-[9px] uppercase font-mono tracking-wider ${textSecondary}`}>Emergency Specialties</label>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['Tyre', 'Battery', 'Engine', 'Overheating', 'Other'] as IssueCategory[]).map((spec) => {
                            const isSelected = mechSpecialties.includes(spec);
                            return (
                              <button
                                key={spec}
                                type="button"
                                onClick={() => {
                                  if (isSelected) {
                                    setMechSpecialties(prev => prev.filter(s => s !== spec));
                                  } else {
                                    setMechSpecialties(prev => [...prev, spec]);
                                  }
                                }}
                                className={`py-1.5 rounded-lg text-[9px] font-mono font-bold border transition-all ${
                                  isSelected 
                                    ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/40' 
                                    : isDark
                                      ? 'bg-neutral-900 border-neutral-800 text-neutral-400'
                                      : 'bg-white border-slate-200 text-slate-500'
                                }`}
                              >
                                {spec}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setMechanicStep('dashboard')}
                    disabled={mechSpecialties.length === 0 || !mechName || !mechContact}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-400 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95 mt-4 shrink-0"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Save Profile & Go Online</span>
                  </button>
                </motion.div>
              )}

              {/* STEP 3: MECHANIC DASHBOARD */}
              {userRole === 'mechanic' && mechanicStep === 'dashboard' && (
                <motion.div
                  key="mech-dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col justify-between overflow-y-auto scrollbar-thin"
                >
                  <div className="p-4 flex flex-col gap-4">
                    {/* Header Banner */}
                    <div className={`border rounded-2xl p-3 flex justify-between items-center transition-colors ${cardBg}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-600">
                          <Wrench className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">{mechName}</span>
                          <span className={`text-[10px] font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{mechNeighborhood} Corridors</span>
                        </div>
                      </div>

                      <button
                        onClick={() => setMechStatus(prev => prev === 'online' ? 'standby' : 'online')}
                        className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-extrabold uppercase tracking-widest border transition-all ${
                          mechStatus === 'online'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500 animate-pulse'
                            : 'bg-slate-500/15 border-slate-500/30 text-slate-500'
                        }`}
                      >
                        ● {mechStatus}
                      </button>
                    </div>

                    {/* Stats Section */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className={`border rounded-xl p-2.5 flex flex-col ${cardBg}`}>
                        <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">Today's Payouts</span>
                        <span className={`text-sm font-extrabold text-blue-500 mt-1`}>₹{mechEarnings.toLocaleString()}</span>
                      </div>
                      <div className={`border rounded-xl p-2.5 flex flex-col ${cardBg}`}>
                        <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">Completed Shifts</span>
                        <span className={`text-sm font-extrabold text-emerald-500 mt-1`}>{mechCompletedCount} dispatches</span>
                      </div>
                      <div className={`border rounded-xl p-2.5 flex flex-col ${cardBg}`}>
                        <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">On-Time Accuracy</span>
                        <span className={`text-xs font-bold text-amber-500 mt-1`}>{mechOnTimeRate}% punctual</span>
                      </div>
                      <div className={`border rounded-xl p-2.5 flex flex-col ${cardBg}`}>
                        <span className="text-[7px] font-mono text-slate-500 uppercase tracking-widest">Reliability score</span>
                        <span className={`text-xs font-bold text-purple-500 mt-1`}>{mechReliabilityIndex} Index</span>
                      </div>
                    </div>

                    {/* Live Corridor Scanning */}
                    <div className="flex flex-col items-center py-4 border-t border-[#222]/10 dark:border-[#222]/40 gap-3">
                      {mechStatus === 'online' && !incomingRequest ? (
                        <>
                          <div className="relative w-12 h-12 flex items-center justify-center">
                            <div className="absolute inset-0 rounded-full bg-emerald-500/10 border border-emerald-500/20 animate-ping" />
                            <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white shadow-md">
                              <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                            </div>
                          </div>
                          <div className="text-center">
                            <span className={`text-[10px] font-mono tracking-wide ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Scanning Highway Corridors...</span>
                            <p className="text-[8px] text-slate-500 mt-0.5 max-w-[200px] leading-relaxed">
                              Awaiting incoming motorist breakdown calls in Gomti Nagar, Chinhat, and Hazratganj corridors.
                            </p>
                          </div>
                        </>
                      ) : mechStatus !== 'online' ? (
                        <div className="text-center py-4">
                          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">System Standby Mode</span>
                          <p className="text-[9px] text-slate-500 mt-1.5 max-w-[200px] mx-auto">
                            Switch status to <strong>Online</strong> above to begin receiving dynamic Lucknow emergency alerts.
                          </p>
                        </div>
                      ) : null}
                    </div>

                    {/* Incoming Emergency Dispatch Trigger */}
                    {mechStatus === 'online' && incomingRequest && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="border-2 border-red-500/40 bg-red-500/5 rounded-2xl p-4 flex flex-col gap-3 shadow-lg"
                      >
                        <div className="flex justify-between items-center pb-2 border-b border-red-500/20">
                          <span className="text-[8px] font-mono text-red-500 font-extrabold uppercase tracking-widest flex items-center gap-1 animate-pulse">
                            <AlertCircle className="w-3 h-3 text-red-500" />
                            <span>Critical SOS Dispatch</span>
                          </span>
                          <span className="text-[9px] text-red-400 font-mono font-bold">
                            {incomingRequest.distance} km away
                          </span>
                        </div>

                        <div className="flex flex-col gap-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Motorist:</span>
                            <span className={`font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{incomingRequest.driverName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Breakdown Sector:</span>
                            <span className="text-blue-500 font-mono uppercase font-bold text-[10px]">{incomingRequest.category}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-relaxed mt-1 bg-[#1a0f0f] p-2 rounded-lg border border-red-950/20">
                            "{incomingRequest.description}"
                          </p>
                        </div>

                        {/* Motorist's uploaded photo block */}
                        {incomingRequest.photos && incomingRequest.photos.length > 0 && (
                          <div className="flex flex-col gap-1 mt-1">
                            <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest">Uploaded Motorist Photo:</span>
                            <div className="relative rounded-xl overflow-hidden h-24 border border-red-950/40">
                              <img 
                                src={incomingRequest.photos[0]} 
                                alt="Motorist breakdown"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-2 border-t border-red-500/20">
                          <div>
                            <span className="text-[8px] font-mono text-slate-500 uppercase block">Estimated Payout</span>
                            <span className="text-base font-extrabold text-emerald-500">₹{incomingRequest.estimatedPayout}</span>
                          </div>

                          <div className="flex gap-1.5">
                            <button
                              onClick={handleRejectJob}
                              className={`px-3 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase border cursor-pointer transition-colors ${
                                isDark
                                  ? 'bg-neutral-900 border-neutral-800 text-slate-400 hover:bg-neutral-800'
                                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                              }`}
                            >
                              Ignore
                            </button>
                            <button
                              onClick={handleAcceptJob}
                              className="px-4 py-1.5 rounded-lg text-[9px] font-mono font-bold uppercase bg-emerald-600 text-white shadow-md hover:bg-emerald-500 cursor-pointer transition-transform active:scale-95"
                            >
                              Dispatch Now
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* STEP 4: ACTIVE JOB */}
              {userRole === 'mechanic' && mechanicStep === 'active-job' && mechActiveJob && (
                <motion.div
                  key="mech-active-job"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col justify-between overflow-hidden"
                >
                  {/* Active Job Map Widget */}
                  <LucknowMap 
                    driverCoords={mechActiveJob.driverCoords}
                    driverAddress={mechActiveJob.driverAddress}
                    selectedMechanic={{
                      id: "self_mech",
                      name: mechName,
                      address: `${mechNeighborhood} High Street Corridor, Lucknow`,
                      neighborhood: mechNeighborhood,
                      lat: getNeighborhoodCoords(mechNeighborhood).lat,
                      lng: getNeighborhoodCoords(mechNeighborhood).lng,
                      phone: `+91 ${mechContact}`,
                      specialties: mechSpecialties,
                      mri: 98,
                      rating: 4.9,
                      completions: mechCompletedCount,
                      onTimeRate: mechOnTimeRate,
                      responseMins: 11,
                      status: 'online',
                      priceEstimate: `₹${mechBaseFee} Base`,
                      warranty: "30 Days Service Guarantee",
                      distance: mechActiveJob.distance
                    }}
                    isDispatching={mechJobStep === 'navigating'}
                    onArrived={() => {}}
                    isOffline={false}
                    isDark={isDark}
                  />

                  {/* Stage-based Header */}
                  <div className={`p-3.5 flex justify-between items-center border-b shrink-0 ${cardBg}`}>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[8px] font-mono text-blue-500 uppercase tracking-widest font-extrabold">
                          {mechJobStep === 'navigating' ? 'EN-ROUTE TO MOTORIST' : mechJobStep === 'diagnosing' ? 'INSPECTION & ASSESSMENT' : 'HANDS-ON REPAIRS IN PROGRESS'}
                        </span>
                        {mechJobStep === 'navigating' && (
                          <span className="text-[10px] font-mono text-emerald-500 font-bold">{mechDispatchProgress}%</span>
                        )}
                      </div>

                      {/* Dispatch navigation progress bar */}
                      {mechJobStep === 'navigating' ? (
                        <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-[#1a1a1a]' : 'bg-slate-100'}`}>
                          <div 
                            className="bg-blue-600 h-full transition-all duration-300"
                            style={{ width: `${mechDispatchProgress}%` }}
                          />
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs">
                          <MapPin className="w-3.5 h-3.5 text-red-500" />
                          <span className={`truncate max-w-[240px] font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{mechActiveJob.driverAddress}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle Scrollable Section with Split view: Chats vs Operations */}
                  <div className={`flex-1 overflow-y-auto flex flex-col ${isDark ? 'bg-[#121212]' : 'bg-slate-50'}`}>
                    
                    {/* Diagnostic / Repair panel if arrived */}
                    {mechJobStep !== 'navigating' && (
                      <div className={`p-4 border-b flex flex-col gap-3.5 ${cardBg}`}>
                        <div className="flex justify-between items-center pb-2 border-b dark:border-[#262626]/50 border-slate-200">
                          <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Smart Diagnosis & Parts</span>
                          <span className="text-[9px] font-mono text-emerald-600 font-bold">Category: {mechActiveJob.category}</span>
                        </div>

                        {/* Motorist AI Diagnostic recommendation */}
                        <div className={`p-3 rounded-xl flex flex-col gap-1 ${isDark ? 'bg-neutral-900/60 border border-neutral-800' : 'bg-white border border-slate-100 shadow-3xs'}`}>
                          <div className="flex items-center gap-1">
                            <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                            <span className="text-[9px] font-mono font-extrabold text-blue-500 uppercase tracking-widest">Recommended AI Action</span>
                          </div>
                          <span className={`text-[11px] font-bold ${textPrimary}`}>{mechActiveJob.aiDiagnosis.issue}</span>
                          <p className="text-[9px] text-slate-500 leading-relaxed mt-0.5">{mechActiveJob.aiDiagnosis.recommendedAction}</p>
                        </div>

                        {/* Operations stages buttons */}
                        {mechJobStep === 'diagnosing' ? (
                          <div className="flex flex-col gap-2">
                            <p className="text-[9px] text-slate-500">
                              Please greet the motorist and inspect the vehicle physical system. Ready to begin repairing and mounting spare parts?
                            </p>
                            <button
                              onClick={() => setMechJobStep('repairing')}
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Wrench className="w-4 h-4" />
                              <span>Begin Physical Repair Phase</span>
                            </button>
                          </div>
                        ) : mechJobStep === 'repairing' ? (
                          <div className="flex flex-col gap-3">
                            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest block">Incur Spare Parts & Materials (Optional):</span>
                            
                            <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1.5 scrollbar-thin">
                              {(ACCESSORY_PARTS[mechActiveJob.category] || ACCESSORY_PARTS['Other']).map((part) => {
                                const isAdded = mechInvoiceParts.includes(part.name);
                                return (
                                  <button
                                    key={part.name}
                                    onClick={() => handleTogglePart(part.name, part.price)}
                                    className={`w-full text-left px-3 py-2 rounded-xl border flex justify-between items-center text-[10px] transition-all cursor-pointer ${
                                      isAdded 
                                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500' 
                                        : isDark
                                          ? 'bg-[#121212] border-[#222] text-slate-300 hover:border-slate-800'
                                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${isAdded ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-400'}`}>
                                        {isAdded && <span className="text-[8px] font-extrabold">✓</span>}
                                      </div>
                                      <span className="font-medium">{part.name}</span>
                                    </div>
                                    <span className="font-mono font-bold">₹{part.price}</span>
                                  </button>
                                );
                              })}
                            </div>

                            <div className={`p-2.5 rounded-xl flex justify-between items-center border border-dashed text-[10px] ${isDark ? 'bg-[#121212] border-[#262626]' : 'bg-slate-50 border-slate-300'}`}>
                              <span className="text-slate-500 uppercase font-mono tracking-wider">Subtotal Invoice:</span>
                              <span className={`font-mono font-bold ${textPrimary}`}>
                                ₹{(mechBaseFee + mechServiceFee + mechInvoicePartsFee).toLocaleString()}
                              </span>
                            </div>

                            <button
                              onClick={handleGenerateInvoice}
                              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md cursor-pointer transition-transform active:scale-95"
                            >
                              <CheckCircle2 className="w-4.5 h-4.5" />
                              <span>Generate Invoice & Complete Job</span>
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* Chat Messages tunnel */}
                    <div className="flex-1 p-3 overflow-y-auto flex flex-col gap-2.5 scrollbar-thin max-h-56">
                      <div className="text-center my-1 shrink-0">
                        <span className={`text-[8px] border px-2 py-0.5 rounded font-mono uppercase tracking-widest ${isDark ? 'bg-[#1a1a1a] border-[#262626]/50 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                          Live Chat with Stranded Driver
                        </span>
                      </div>

                      {mechChatMessages.map((msg) => {
                        if (msg.sender === 'system') {
                          return (
                            <div key={msg.id} className="text-center my-0.5">
                              <span className="text-[9px] text-slate-500 font-mono italic">{msg.text}</span>
                            </div>
                          );
                        }
                        
                        const isMe = msg.sender === 'mechanic';
                        return (
                          <div 
                            key={msg.id} 
                            className={`flex flex-col max-w-[80%] ${isMe ? 'self-end items-end' : 'self-start items-start'}`}
                          >
                            <div className={`px-3 py-2 rounded-xl text-xs ${
                              isMe 
                                ? 'bg-emerald-600 text-white font-semibold rounded-tr-none' 
                                : isDark 
                                  ? 'bg-[#1a1a1a] text-slate-200 rounded-tl-none border border-[#262626]'
                                  : 'bg-slate-100 text-slate-800 rounded-tl-none border border-slate-200'
                            }`}>
                              <p className="leading-relaxed">{msg.text}</p>
                            </div>
                            <span className="text-[7px] text-slate-500 font-mono mt-0.5">{msg.timestamp}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Chat Input form at bottom */}
                  <div className={`p-3 border-t shrink-0 ${cardBg}`}>
                    <form onSubmit={handleSendMechChat} className="flex gap-2">
                      <input 
                        type="text"
                        value={mechChatInput}
                        onChange={(e) => setMechChatInput(e.target.value)}
                        placeholder={`Message ${mechActiveJob.driverName}...`}
                        className={`flex-1 focus:outline-none rounded-xl py-2 px-3 text-xs transition-colors focus:border-emerald-500 ${inputBg}`}
                      />
                      <button 
                        type="submit" 
                        className="bg-emerald-600 hover:bg-emerald-700 text-white w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer transition-transform active:scale-95 shadow-md shadow-emerald-500/10"
                      >
                        <Send className="w-4 h-4" />
                      </button>
                    </form>
                  </div>
                </motion.div>
              )}

              {/* STEP 5: COMPLETED RECEIPT */}
              {userRole === 'mechanic' && mechanicStep === 'completed' && mechGeneratedReceipt && (
                <motion.div
                  key="mech-completed"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-1 p-4 flex flex-col justify-between overflow-y-auto"
                >
                  <div className="flex flex-col gap-4">
                    {/* Header Stamp */}
                    <div className="text-center py-2 flex flex-col items-center gap-1.5">
                      <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-600">
                        <CheckCircle2 className="w-7 h-7" />
                      </div>
                      <h3 className={`text-sm font-bold uppercase tracking-wider ${textPrimary}`}>Assistance Invoice Registered</h3>
                      <p className="text-[10px] text-slate-500 font-mono">Invoice ID: #{mechGeneratedReceipt.invoiceId}</p>
                    </div>

                    {/* Receipt Details card */}
                    <div className={`border rounded-2xl p-4 flex flex-col gap-3.5 transition-colors ${cardBg}`}>
                      <div className={`flex justify-between items-center pb-2.5 border-b ${isDark ? 'border-[#262626]' : 'border-slate-200'}`}>
                        <span className={`text-xs font-bold ${textPrimary}`}>Filing Summary</span>
                        <span className="text-[9px] font-mono text-emerald-600 uppercase bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                          Digital UPI Requested
                        </span>
                      </div>

                      <div className="flex flex-col gap-2.5 text-[11px] font-sans">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Stranded Motorist:</span>
                          <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{mechActiveJob?.driverName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Motorist Phone:</span>
                          <span className="text-slate-400 font-mono">{mechGeneratedReceipt.driverPhone}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Breakdown Location:</span>
                          <span className={`text-right truncate max-w-[180px] ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{mechGeneratedReceipt.location}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Materials Incurred:</span>
                          <span className="text-blue-600 font-mono uppercase font-bold text-[9px] truncate max-w-[170px]">
                            {mechGeneratedReceipt.partsUsed.join(', ')}
                          </span>
                        </div>
                      </div>

                      {/* Financials */}
                      <div className={`pt-2.5 flex flex-col gap-2 font-mono text-[10px] border-t ${isDark ? 'border-[#262626]' : 'border-slate-200'}`}>
                        <div className="flex justify-between text-slate-500">
                          <span>Emergency Callout Fee:</span>
                          <span>₹{mechGeneratedReceipt.baseFee.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Labor Service Fee:</span>
                          <span>₹{mechGeneratedReceipt.serviceFee.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>Replacement Parts:</span>
                          <span>₹{mechGeneratedReceipt.partsFee.toLocaleString()}</span>
                        </div>
                         <div className={`text-xs font-bold pt-1.5 border-t flex justify-between ${isDark ? 'border-[#262626]/40' : 'border-slate-200'}`}>
                          <span className={textPrimary}>TOTAL EARNED:</span>
                          <span className="text-blue-600 text-sm">₹{mechGeneratedReceipt.totalFee.toLocaleString()}</span>
                        </div>
                        {/* Split payout card */}
                        <div className="mt-2 p-2.5 rounded-xl bg-emerald-500/5 border border-dashed border-emerald-500/20 text-[9px] flex flex-col gap-1 text-slate-400 font-mono">
                          <div className="flex justify-between">
                            <span className="flex items-center gap-1 text-slate-500">
                              <span className="w-1 h-1 rounded-full bg-blue-500" />
                              App Commission (10%):
                            </span>
                            <span className="text-slate-500">-₹{(mechGeneratedReceipt.platformFee || Math.round(mechGeneratedReceipt.totalFee * 0.1)).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-t border-dashed dark:border-neutral-800 border-slate-200 pt-1.5 font-bold">
                            <span className="flex items-center gap-1 text-emerald-500">
                              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                              Net Bank Settlement (90%):
                            </span>
                            <span className="text-emerald-500 text-xs">₹{(mechGeneratedReceipt.mechanicFee || (mechGeneratedReceipt.totalFee - Math.round(mechGeneratedReceipt.totalFee * 0.1))).toLocaleString()}</span>
                          </div>
                          <div className="text-[7.5px] mt-1 text-slate-500 text-center font-sans">
                            Deposited to: {mechGeneratedReceipt.mechanicBankDetails || `${mechBankName} A/c ****${mechBankAccount.slice(-4)}`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Official Warranty */}
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 flex gap-3 items-center">
                      <Award className="w-8 h-8 text-emerald-600 shrink-0" />
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-600">Secure Dispatch Recorded</span>
                        <p className="text-[9px] text-slate-500 leading-relaxed">
                          This completed dispatch has been secured by your verified workshop's warranty guarantee of <strong>30 Days</strong>.
                        </p>
                      </div>
                    </div>

                    {/* QR Code Container for Customer to Scan from Mechanic's Phone */}
                    <div className={`border rounded-2xl p-4 flex flex-col items-center gap-3 ${cardBg}`}>
                      <div className="flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-blue-500 animate-pulse" />
                        <span className={`text-[9px] font-mono uppercase tracking-widest ${textSecondary}`}>
                          Show Customer to Scan & Pay
                        </span>
                      </div>
                      
                      <div className="relative p-2 bg-white rounded-xl shadow-md border border-slate-200 flex items-center justify-center">
                        {/* Decorative scanning red laser line */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-red-500 opacity-60 animate-bounce" />
                        
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                            `upi://pay?pa=${mechUpiId}&pn=${encodeURIComponent(mechGeneratedReceipt.garageName)}&am=${mechGeneratedReceipt.totalFee}&tn=OttoAssist_Invoice_${mechGeneratedReceipt.invoiceId}&cu=INR`
                          )}`} 
                          alt="BHIM UPI Split Payment QR"
                          className="w-36 h-36"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1 text-slate-500 font-mono text-[8px] uppercase">
                          <span>BHIM</span> • <span>GPay</span> • <span>PhonePe</span> • <span>Paytm</span>
                        </div>
                        <span className="text-[8px] text-emerald-600 dark:text-emerald-500 font-mono text-center">
                          Split Settlement Configured: 90% (₹{(mechGeneratedReceipt.totalFee - Math.round(mechGeneratedReceipt.totalFee * 0.1)).toLocaleString()}) directly to you.
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <button
                      onClick={() => {
                        setIsDownloading(true);
                        setTimeout(() => {
                          generateReceiptPDF(mechGeneratedReceipt);
                          setIsDownloading(false);
                        }, 1200);
                      }}
                      disabled={isDownloading}
                      className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/10 cursor-pointer transition-all"
                    >
                      {isDownloading ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-white" />
                      ) : (
                        <>
                          <Download className="w-4.5 h-4.5" />
                          <span>Download Digital Invoice (PDF)</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-[#121212] flex gap-2">
                    <button
                      onClick={() => {
                        // Complete Shift (with 90% earnings credited to mechanic)
                        const mechanicShare = mechGeneratedReceipt.mechanicFee || Math.round(mechGeneratedReceipt.totalFee * 0.9);
                        setMechEarnings(prev => prev + mechanicShare);
                        setMechCompletedCount(prev => prev + 1);
                        setMechActiveJob(null);
                        setMechGeneratedReceipt(null);
                        setMechanicStep('dashboard');
                      }}
                      className={`w-full border font-mono text-[10px] py-2.5 rounded-xl uppercase tracking-wider active:scale-95 transition-transform cursor-pointer ${
                        isDark 
                          ? 'bg-[#1a1a1a] border-[#262626] hover:border-[#333] text-slate-300' 
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Scan Next Emergency SOS
                    </button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          )}

          {/* MOBILE IMPORT VIA QR DIALOG */}
          {showMobileImportModal && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4 text-center border ${
                  isDark ? 'bg-[#1a1a1a] border-[#262626]' : 'bg-white border-slate-200 shadow-xl'
                }`}
              >
                <div className={`flex justify-between items-center pb-2 border-b ${isDark ? 'border-[#262626]' : 'border-slate-100'}`}>
                  <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Mobile Photo Importer
                  </span>
                  <button 
                    onClick={() => setShowMobileImportModal(false)}
                    className="text-slate-400 hover:text-slate-600 font-mono text-sm cursor-pointer"
                  >
                    &times;
                  </button>
                </div>

                <div className="flex flex-col items-center gap-3">
                  {/* High Quality Simulated QR Code vector SVG */}
                  <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-white border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <svg className="w-28 h-28 text-slate-900" viewBox="0 0 100 100" fill="currentColor">
                      <path d="M5,5 h20 v20 h-20 z M9,9 h12 v12 h-12 z" />
                      <path d="M75,5 h20 v20 h-20 z M79,9 h12 v12 h-12 z" />
                      <path d="M5,75 h20 v20 h-20 z M9,79 h12 v12 h-12 z" />
                      <path d="M35,15 h10 v10 h-10 z M55,10 h10 v10 h-10 z M15,35 h15 v5 h-15 z" />
                      <path d="M45,45 h25 v10 h-25 z M50,60 h10 v25 h-10 z M70,75 h15 v15 h-15 z" />
                      <path d="M35,70 h5 v20 h-5 z M50,30 h25 v5 h-25 z M10,50 h15 v10 h-15 z" />
                      {/* Blue center brand logo connector */}
                      <rect x="42" y="42" width="16" height="16" rx="4" fill="#2563eb" />
                      <circle cx="50" cy="50" r="4" fill="#ffffff" />
                    </svg>
                  </div>

                  <div className="flex flex-col gap-1.5 text-left">
                    <span className={`text-[10px] font-bold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      Scan to Pair Mobile Camera
                    </span>
                    <p className={`text-[9px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      1. Scan this QR code with your smartphone camera.<br />
                      2. Snap up to 10 live breakdown/damage photos on your phone.<br />
                      3. Tap "Sync Photos" on your phone to instantly upload them to this computer screen.
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      if (uploadedPhotos.length < 10) {
                        const mobileMockPics = [
                          "https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?auto=format&fit=crop&q=80&w=400",
                          "https://images.unsplash.com/photo-1578844251758-2f71da64c96f?auto=format&fit=crop&q=80&w=400"
                        ];
                        setUploadedPhotos(prev => [...prev, ...mobileMockPics].slice(0, 10));
                      }
                      setShowMobileImportModal(false);
                    }}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-mono text-[10px] font-bold py-2.5 rounded-xl uppercase tracking-wider cursor-pointer"
                  >
                    Simulate Mobile Upload (2 photos)
                  </button>
                </div>
              </motion.div>
            </div>
          )}

        </div>

        {/* Portrait Device Home Swipe Bar indicators */}
        <div className={`py-2.5 flex justify-center items-center shrink-0 transition-colors ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}>
          <div className={`w-24 h-1 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-300'}`} />
        </div>

      </div>
    </div>
  );
}
