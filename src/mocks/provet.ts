import type {
  Client,
  Consultation,
  Patient,
} from "@/schemas/provet";

export const mockClients: Client[] = [
  {
    id: "CLI-001",
    identification: { type: "CC", number: "1234567890" },
    name: "María García López",
    email: "maria.garcia@email.com",
    address: "Calle 80 #45-23, Bogotá",
    phone: "3105550101",
    client_type: "natural",
  },
  {
    id: "CLI-002",
    identification: { type: "NIT", number: "900123456-1" },
    name: "Veterinaria Los Andes S.A.S.",
    email: "factura@losandes.co",
    address: "Cra 15 #92-38, Medellín",
    phone: "6045550102",
    client_type: "juridical",
  },
  {
    id: "CLI-003",
    identification: { type: "CE", number: "CE9876543" },
    name: "John Smith",
    email: "jsmith@petcare.co",
    address: "Av. El Poblado #22A-15, Medellín",
    phone: "3125550103",
    client_type: "natural",
  },
];

export const mockPatients: Patient[] = [
  {
    id: "PAT-001",
    name: "Max",
    species: "Canino",
    breed: "Golden Retriever",
    owner_id: "CLI-001",
  },
  {
    id: "PAT-002",
    name: "Luna",
    species: "Felino",
    breed: "Siamés",
    owner_id: "CLI-001",
  },
  {
    id: "PAT-003",
    name: "Rocky",
    species: "Canino",
    breed: "Bulldog Francés",
    owner_id: "CLI-002",
  },
];

export const mockConsultations: Consultation[] = [
  {
    id: "CON-001",
    client_id: "CLI-001",
    patient_id: "PAT-001",
    items: [
      {
        name: "Consulta General",
        code: "SERV-CG-01",
        quantity: 1,
        unit_price: 50000,
        tax_rate: 0.19,
        discount: 0,
      },
      {
        name: "Hemograma Completo",
        code: "LAB-HEM-01",
        quantity: 1,
        unit_price: 30000,
        tax_rate: 0.19,
        discount: 0,
      },
    ],
    subtotal: 80000,
    tax_total: 15200,
    total: 95200,
    payment_method: "Tarjeta Crédito",
    status: "closed",
    created_at: new Date("2026-08-15T08:00:00.000Z"),
    updated_at: new Date("2026-08-15T09:30:00.000Z"),
  },
  {
    id: "CON-002",
    client_id: "CLI-002",
    patient_id: "PAT-003",
    items: [
      {
        name: "Vacuna Óctuple",
        code: "VAC-OCT-01",
        quantity: 1,
        unit_price: 50000,
        tax_rate: 0.05,
        discount: 0,
      },
    ],
    subtotal: 50000,
    tax_total: 2500,
    total: 52500,
    payment_method: "Efectivo",
    status: "pending",
    created_at: new Date("2026-08-16T10:00:00.000Z"),
    updated_at: new Date("2026-08-16T10:30:00.000Z"),
  },
  {
    id: "CON-003",
    client_id: "CLI-003",
    patient_id: "PAT-002",
    items: [
      {
        name: "Desparasitante Oral",
        code: "MED-DES-05",
        quantity: 2,
        unit_price: 35000,
        tax_rate: 0,
        discount: 0,
      },
      {
        name: "Corte de Uñas",
        code: "SERV-CUN-01",
        quantity: 1,
        unit_price: 50000,
        tax_rate: 0,
        discount: 0,
      },
    ],
    subtotal: 120000,
    tax_total: 0,
    total: 120000,
    payment_method: "Transferencia",
    status: "closed",
    created_at: new Date("2026-08-17T11:00:00.000Z"),
    updated_at: new Date("2026-08-17T11:45:00.000Z"),
  },
];
