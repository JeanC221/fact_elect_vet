import {
  consultationSchema,
  clientSchema,
  patientSchema,
} from "@/schemas/provet";
import type { Consultation, Client, Patient } from "@/schemas/provet";
import { mockConsultations, mockClients, mockPatients } from "@/mocks/provet";

/**
 * Fetch a single consultation by its Provet ID.
 * Stub: returns mock data with Zod runtime validation.
 *
 * Replace with `fetch()` when Provet API credentials are configured.
 */
export async function fetchConsultation(id: string): Promise<Consultation> {
  const found = mockConsultations.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Consultation not found: ${id}`);
  }
  return consultationSchema.parse(found);
}

/**
 * Fetch a client (owner) by its Provet ID.
 */
export async function fetchClient(id: string): Promise<Client> {
  const found = mockClients.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Client not found: ${id}`);
  }
  return clientSchema.parse(found);
}

/**
 * Fetch a patient by its Provet ID.
 */
export async function fetchPatient(id: string): Promise<Patient> {
  const found = mockPatients.find((p) => p.id === id);
  if (!found) {
    throw new Error(`Patient not found: ${id}`);
  }
  return patientSchema.parse(found);
}