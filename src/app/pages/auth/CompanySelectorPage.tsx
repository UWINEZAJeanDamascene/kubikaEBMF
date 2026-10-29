import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuthStore } from '@/store/authStore';
import { companyApi } from '@/lib/api';
import { Loader2, Building2, LogOut } from 'lucide-react';
import { toast } from 'sonner';

// Company info from API
interface CompanyInfo {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  address?: {
    city?: string;
    country?: string;
  };
}

export default function CompanySelectorPage() {
  const navigate = useNavigate();
  const { companies, user, logout, setActiveCompany } = useAuthStore();
  
  const [companyDetails, setCompanyDetails] = useState<Map<string, CompanyInfo>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  
  useEffect(() => {
    // Fetch company details for all companies in memberships
    const fetchCompanyDetails = async () => {
      if (!companies || companies.length === 0) {
        toast.error('No companies available');
        navigate('/dashboard');
        return;
      }
      
      const detailsMap = new Map<string, CompanyInfo>();
      
      // Fetch all companies in parallel
      await Promise.all(
        companies.map(async (membership) => {
          try {
            const response = await companyApi.getById(membership.companyId);
            if (response.success && response.data) {
              detailsMap.set(membership.companyId, response.data as CompanyInfo);
            }
          } catch (error) {
            console.error(`Failed to fetch company ${membership.companyId}:`, error);
          }
        })
      );
      
      setCompanyDetails(detailsMap);
      setIsLoading(false);
    };
    
    fetchCompanyDetails();
  }, [companies, navigate]);
  
  const handleSelectCompany = (companyId: string) => {
    const membership = companies.find(m => m.companyId === companyId);
    if (membership) {
      setActiveCompany(companyId, membership.role);
      toast.success(`Switched to ${companyDetails.get(companyId)?.name || 'company'}`);
      navigate('/launcher');
    }
  };
  
  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-slate-400">Loading your companies...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4 py-12">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50"></div>
      
      <div className="relative w-full max-w-lg 2xl:max-w-[1100px]">
        <button
          onClick={handleLogout}
          className="absolute -top-12 right-0 text-slate-400 hover:text-white transition-colors flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
        
        <div className="bg-slate-800/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-blue-500" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Select Company</h1>
            <p className="text-slate-400">
              You have access to multiple companies. Please select one to continue.
            </p>
            <p className="text-slate-500 text-sm mt-2">
              Logged in as: {user?.email}
            </p>
          </div>
          
          <div className="space-y-3">
            {companies.map((membership) => {
              const company = companyDetails.get(membership.companyId);
              const isSelected = selectedCompany === membership.companyId;
              
              return (
                <button
                  key={membership.companyId}
                  onClick={() => handleSelectCompany(membership.companyId)}
                  disabled={selectedCompany !== null}
                  className={`w-full p-4 rounded-xl border transition-all text-left group ${
                    isSelected
                      ? 'border-blue-500 bg-blue-500/20'
                      : 'border-slate-600/50 bg-slate-900/30 hover:border-slate-500 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-white font-semibold text-lg">
                        {company?.name || 'Loading...'}
                      </h3>
                      {company?.address?.city && (
                        <p className="text-slate-400 text-sm mt-1">
                          {company.address.city}{company.address.country ? `, ${company.address.country}` : ''}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-700 text-slate-300">
                        {membership.role}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          
          {companies.length === 0 && (
            <div className="text-center py-8">
              <p className="text-slate-400">No companies available</p>
              <button
                onClick={handleLogout}
                className="mt-4 text-blue-400 hover:text-blue-300"
              >
                Logout and try again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}