import { Link } from "react-router-dom";

const GOOGLE_AUTH_URL = `${import.meta.env.VITE_API_URL}/api/auth/google?mode=signup`;

export default function Signup() {
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-violet-600 rounded-xl mb-4">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Create account</h1>
          <p className="text-zinc-500 text-sm mt-1">Sign up to get started</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
          <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-xl p-4 mb-5">
            <div className="flex gap-3">
              <div className="w-5 h-5 mt-0.5 text-violet-400 flex-shrink-0">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-zinc-400 text-xs leading-relaxed">
                If you already have an account, signing up will log you in automatically. No duplicate accounts will be created.
              </p>
            </div>
          </div>

          <a
            href={GOOGLE_AUTH_URL}
            className="flex items-center justify-center gap-3 w-full bg-white hover:bg-zinc-100 text-zinc-900 font-semibold py-3 rounded-xl transition-all duration-150 text-sm shadow"
          >
            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-5 h-5" alt="Google" />
            Sign up with Google
          </a>

          <p className="text-center text-zinc-600 text-xs mt-6">
            By continuing, you agree to our Terms of Service
          </p>
        </div>

        <p className="text-center text-zinc-500 text-sm mt-6">
          Already have an account?{" "}
          <Link to="/login" className="text-violet-400 hover:text-violet-300 font-medium transition-colors">
            Log in
          </Link>
        </p>

      </div>
    </div>
  );
}