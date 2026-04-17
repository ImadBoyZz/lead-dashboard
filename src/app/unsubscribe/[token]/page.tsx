import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe';
import { UnsubscribeForm } from './unsubscribe-form';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ token: string }>;
};

export default async function UnsubscribePage({ params }: Props) {
  const { token } = await params;
  const verification = verifyUnsubscribeToken(token);

  if (!verification.valid) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white shadow-sm rounded-lg p-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Link ongeldig</h1>
          <p className="text-sm text-gray-600">
            Deze afmeldlink is ongeldig of verlopen. Contacteer ons rechtstreeks
            op <a className="underline" href="mailto:imad@averissolutions.be">imad@averissolutions.be</a>.
          </p>
        </div>
      </main>
    );
  }

  const rows = await db
    .select({
      name: schema.businesses.name,
      email: schema.businesses.email,
      optOut: schema.businesses.optOut,
    })
    .from(schema.businesses)
    .where(eq(schema.businesses.id, verification.businessId))
    .limit(1);

  const business = rows[0];

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full bg-white shadow-sm rounded-lg p-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          {business?.optOut ? 'U bent afgemeld' : 'Afmelden bevestigen'}
        </h1>
        {business?.optOut ? (
          <p className="text-sm text-gray-600">
            {business?.name ?? 'Uw bedrijf'} is afgemeld. U ontvangt geen verdere
            berichten meer. Dank voor uw tijd.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-6">
              Druk op de knop om {business?.name ?? 'uw bedrijf'} definitief af
              te melden voor verdere berichten van Averis Solutions.
            </p>
            <UnsubscribeForm token={token} />
          </>
        )}
        <p className="mt-6 text-xs text-gray-400 border-t pt-4">
          Averis Solutions · averissolutions.be
        </p>
      </div>
    </main>
  );
}
