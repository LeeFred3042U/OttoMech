export interface Coords {
  lat: number;
  lng: number;
}

export type IssueCategory = 'Tyre' | 'Battery' | 'Engine' | 'Overheating' | 'Other';

export interface Garage {
  id: string;
  name: string;
  address: string;
  neighborhood: string;
  lat: number;
  lng: number;
  phone: string;
  specialties: IssueCategory[];
  mri: number; // Mechanic Reliability Index (1-100)
  rating: number;
  completions: number;
  onTimeRate: number;
  responseMins: number;
  status: 'online' | 'standby';
  priceEstimate: string;
  warranty: string;
  distance?: number; // Calculated dynamic distance
}

export interface AIDiagnosis {
  issue: string;
  likelyCause: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  recommendedAction: string;
  estCostRange: string;
  suggestedParts: string[];
}

export interface ChatMessage {
  id: string;
  sender: 'driver' | 'mechanic' | 'system';
  text: string;
  timestamp: string;
}

export interface JobReceipt {
  invoiceId: string;
  date: string;
  time: string;
  driverPhone: string;
  location: string;
  garageName: string;
  garagePhone: string;
  issueCategory: IssueCategory;
  issueDescription: string;
  partsUsed: string[];
  baseFee: number;
  serviceFee: number;
  partsFee: number;
  totalFee: number;
  paymentMethod: string;
  warrantyPeriod: string;
  gpsCoords: string;
  platformFee?: number;
  mechanicFee?: number;
  mechanicBankDetails?: string;
  transactionId?: string;
}
