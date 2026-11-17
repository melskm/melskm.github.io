import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yjdjydxhsdibzyvxbhsj.supabase.co'
const SUPABASE_KEY = 'sb_publishable_9DXNbTciyBjV2CiORYIDdw_6KCzJTdu'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
