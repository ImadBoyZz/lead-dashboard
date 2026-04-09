import { NextRequest, NextResponse } from 'next/server';
import { isValidSession } from '@/lib/auth';
import { getGmailThread } from '@/lib/gmail';

interface RouteParams {
  params: Promise<{ threadId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!(await isValidSession(request))) {
    return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 });
  }

  const { threadId } = await params;

  try {
    const thread = await getGmailThread(threadId);
    return NextResponse.json(thread);
  } catch (error) {
    console.error('Gmail thread error:', error);
    return NextResponse.json({ error: 'Thread ophalen mislukt' }, { status: 500 });
  }
}
