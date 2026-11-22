import { Contact, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';

export type PickedContact = {
  contactId: string;
  phone: string | null;
  email: string | null;
};

export type PickOutcome =
  | { status: 'picked'; contact: PickedContact }
  | { status: 'cancelled' }
  | { status: 'denied' }
  | { status: 'failed' };

function firstFilled(values: (string | undefined)[]): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

/** Asks for contacts permission, then lets the user pick one contact. Never writes to the address book. */
export async function pickContact(): Promise<PickOutcome> {
  try {
    const current = await getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      if (current.canAskAgain === false) return { status: 'denied' };
      status = (await requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return { status: 'denied' };

    const contact = await Contact.presentPicker();
    if (!contact) return { status: 'cancelled' };

    const [phones, emails] = await Promise.all([contact.getPhones(), contact.getEmails()]);
    return {
      status: 'picked',
      contact: {
        contactId: contact.id,
        phone: firstFilled(phones.map((phone) => phone.number)),
        email: firstFilled(emails.map((email) => email.address)),
      },
    };
  } catch (error) {
    console.error(error);
    return { status: 'failed' };
  }
}
