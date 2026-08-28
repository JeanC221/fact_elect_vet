import type {
  SiigoError,
  SiigoInvoicePayload,
  SiigoInvoiceResponse,
  SiigoPaymentType,
  SiigoProduct,
} from "@/schemas/siigo";

export const mockSiigoProducts: SiigoProduct[] = [
  {
    id: "PROD-001",
    code: "SERV-CG-01",
    name: "Consulta General Veterinaria",
    price: 50000,
    tax_classification: "IVA_19",
    unit_of_measure: "UND",
  },
  {
    id: "PROD-002",
    code: "PROC-VAC-01",
    name: "Procedimiento de Vacunación",
    price: 35000,
    tax_classification: "IVA_5",
    unit_of_measure: "UND",
  },
  {
    id: "PROD-003",
    code: "PROD-DES-05",
    name: "Desparasitante Oral Canino",
    price: 25000,
    tax_classification: "EXENTO",
    unit_of_measure: "UND",
  },
  {
    id: "PROD-004",
    code: "SERV-CIR-01",
    name: "Cirugía de Esterilización",
    price: 180000,
    tax_classification: "EXCLUIDO",
    unit_of_measure: "UND",
  },
];

export const mockSiigoPaymentTypes: SiigoPaymentType[] = [
  { id: "PT-001", name: "Efectivo", type: "cash" },
  { id: "PT-002", name: "Tarjeta Crédito", type: "card" },
  { id: "PT-003", name: "Transferencia Bancaria", type: "transfer" },
];

export const mockSiigoInvoicePayloads: SiigoInvoicePayload[] = [
  {
    customer: {
      identification: { type: "CC", number: "1234567890" },
      name: ["María García", "López"],
      email: "maria.garcia@email.com",
      phone: "3105550101",
    },
    items: [
      {
        code: "SERV-CG-01",
        description: "Consulta General Veterinaria",
        quantity: 1,
        price: 80000,
        taxes: [{ tax_code: "IVA_19" }],
      },
    ],
    payments: [
      {
        payment_type_id: "PT-002",
        amount: 80000,
        paid_date: new Date("2026-08-15T00:00:00.000Z"),
      },
    ],
    total: 80000,
    stamp: { send: false },
    mail: { send: false },
  },
  {
    customer: {
      identification: { type: "NIT", number: "900123456-1" },
      name: ["Veterinaria Los Andes", "S.A.S."],
      email: "factura@losandes.co",
      phone: "6045550102",
    },
    items: [
      {
        code: "PROD-DES-05",
        description: "Desparasitante Oral Canino x2",
        quantity: 2,
        price: 25000,
        taxes: [{ tax_code: "EXENTO" }],
      },
      {
        code: "SERV-CIR-01",
        description: "Cirugía de Esterilización",
        quantity: 1,
        price: 180000,
        taxes: [{ tax_code: "EXCLUIDO" }],
      },
    ],
    payments: [
      {
        payment_type_id: "PT-003",
        amount: 230000,
        paid_date: new Date("2026-08-16T00:00:00.000Z"),
      },
    ],
    total: 230000,
    stamp: { send: false },
    mail: { send: false },
  },
];

export const mockSiigoInvoiceResponses: SiigoInvoiceResponse[] = [
  {
    id: "INV-7751",
    number: "FV-1-7751",
    cufe: "CUFE-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz",
    status: "Accepted",
  },
  {
    id: "INV-7752",
    number: "FV-1-7752",
    cufe: "",
    status: "Draft",
    observations: "Pendiente de envío a DIAN.",
  },
  {
    id: "INV-7753",
    cufe: "",
    status: "Rejected",
    observations: "DIAN Error: invalid_identification — NIT inválido.",
  },
];

export const mockSiigoErrors: SiigoError[] = [
  {
    code: "invalid_identification",
    message: "La cédula o NIT ingresado no es válido para procesamiento DIAN.",
  },
  {
    code: "invalid_total_payments",
    message:
      "El total pagado no coincide con el subtotal de los ítems facturados.",
  },
];