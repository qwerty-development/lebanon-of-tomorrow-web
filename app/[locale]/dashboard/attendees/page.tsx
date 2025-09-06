"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { UserRole, canUserModifyField } from "@/lib/roleUtils";

type Attendee = {
  id: string;
  name: string;
  recordNumber: string;
  governorate: string;
  district: string;
  area: string;
  phone: string | null;
  quantity: number;
  ages: number[];
};

type Field = { 
  id: string; 
  name: string; 
  is_enabled: boolean; 
  is_main: boolean; 
  sort_order: number;
};

type AttendeeWithStatus = Attendee & {
  fieldStatuses: Record<string, { checkedAt: string | null; quantity: number }>;
};

// Modal types for mobile-friendly dialogs
type QuantityModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  defaultValue: string;
  maxValue?: number;
  isSuperAdmin?: boolean;
  isArabic?: boolean;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  isArabic?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

type AlertModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  isArabic?: boolean;
  onClose: () => void;
};

// Constants for pagination and performance
const PAGE_SIZE = 50;
const DEBOUNCE_DELAY = 300;
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Debounce hook for search optimization
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Retry mechanism for database operations
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }
  }
  
  throw lastError;
}

// Helper function to generate ultra-comprehensive search patterns for any input
function generateSlashPatterns(searchTerm: string): string[] {
  const patterns: string[] = [];
  
  // Always add the original search term (case insensitive)
  patterns.push(`%${searchTerm.toLowerCase()}%`);
  
  // Check if search term contains digits
  const hasDigits = /\d/.test(searchTerm);
  
  if (hasDigits) {
    // Extract all digits from the search term
    const allDigits = searchTerm.replace(/\D/g, '');
    
    if (allDigits.length >= 2) {
      // 1. BASIC DIGIT PATTERNS
      patterns.push(`%${allDigits}%`); // Just the digits
      
      // 2. LEADING ZEROS VARIATIONS (super broad)
      for (let leadingZeros = 1; leadingZeros <= 4; leadingZeros++) {
        const zerosPrefix = '0'.repeat(leadingZeros);
        patterns.push(`%${zerosPrefix}${allDigits}%`);
      }
      
      // 3. **CRITICAL FIX** - REMOVE LEADING ZEROS FROM SEARCH
      // If user searches "03463479", also search for "3463479" (without leading zeros)
      let trimmedDigits = allDigits;
      while (trimmedDigits.startsWith('0') && trimmedDigits.length > 1) {
        trimmedDigits = trimmedDigits.substring(1);
        patterns.push(`%${trimmedDigits}%`);
        
        // Also add variations with different separators for the trimmed number
        if (trimmedDigits.length >= 3) {
          for (let i = 1; i < trimmedDigits.length; i++) {
            const before = trimmedDigits.substring(0, i);
            const after = trimmedDigits.substring(i);
            patterns.push(`%${before}/${after}%`);
            patterns.push(`%${before}-${after}%`);
            patterns.push(`%${before} ${after}%`);
          }
        }
      }
      
      // 4. PHONE NUMBER PATTERNS - LEBANON SPECIFIC & INTERNATIONAL
      if (allDigits.length >= 6) {
        // Lebanese mobile patterns (961, +961, 00961)
        patterns.push(`%961${allDigits}%`);
        patterns.push(`%+961${allDigits}%`);
        patterns.push(`%00961${allDigits}%`);
        
        // Also try with trimmed digits
        if (trimmedDigits !== allDigits && trimmedDigits.length >= 6) {
          patterns.push(`%961${trimmedDigits}%`);
          patterns.push(`%+961${trimmedDigits}%`);
          patterns.push(`%00961${trimmedDigits}%`);
        }
        
        // Common Lebanese mobile prefixes
        const lebMobilePrefixes = ['03', '70', '71', '76', '78', '79', '81'];
        lebMobilePrefixes.forEach(prefix => {
          if (allDigits.startsWith(prefix) || allDigits.includes(prefix)) {
            patterns.push(`%${prefix}${allDigits.replace(prefix, '')}%`);
            patterns.push(`%0${prefix}${allDigits.replace(prefix, '')}%`);
            patterns.push(`%961${prefix}${allDigits.replace(prefix, '')}%`);
            patterns.push(`%+961${prefix}${allDigits.replace(prefix, '')}%`);
          }
          
          // Try with trimmed digits too
          if (trimmedDigits !== allDigits && (trimmedDigits.startsWith(prefix) || trimmedDigits.includes(prefix))) {
            patterns.push(`%${prefix}${trimmedDigits.replace(prefix, '')}%`);
            patterns.push(`%0${prefix}${trimmedDigits.replace(prefix, '')}%`);
            patterns.push(`%961${prefix}${trimmedDigits.replace(prefix, '')}%`);
            patterns.push(`%+961${prefix}${trimmedDigits.replace(prefix, '')}%`);
          }
        });
        
        // If digits might be part of phone number, try common formats
        patterns.push(`%+${allDigits}%`);
        patterns.push(`%00${allDigits}%`);
        if (trimmedDigits !== allDigits) {
          patterns.push(`%+${trimmedDigits}%`);
          patterns.push(`%00${trimmedDigits}%`);
        }
      }
      
      // 5. ALL POSSIBLE SEPARATOR COMBINATIONS
      const separators = ['/', '-', ' ', '_', '.', '(', ')', '+'];
      
      // Single separator at every possible position - for both original and trimmed
      [allDigits, trimmedDigits].forEach(digitString => {
        if (digitString.length >= 2) {
          for (let i = 1; i < digitString.length; i++) {
            const before = digitString.substring(0, i);
            const after = digitString.substring(i);
            
            separators.forEach(sep => {
              patterns.push(`%${before}${sep}${after}%`);
              
              // With leading zeros
              for (let zeros = 1; zeros <= 3; zeros++) {
                const zeroPrefix = '0'.repeat(zeros);
                patterns.push(`%${zeroPrefix}${before}${sep}${after}%`);
                patterns.push(`%${before}${sep}${zeroPrefix}${after}%`);
              }
              
              // Phone number specific formats
              if (digitString.length >= 6) {
                patterns.push(`%961${sep}${before}${sep}${after}%`);
                patterns.push(`%+961${sep}${before}${sep}${after}%`);
                patterns.push(`%00961${sep}${before}${sep}${after}%`);
              }
            });
          }
          
          // **NEW: CRITICAL FIX FOR REVERSE SEPARATOR MATCHING**
          // When user searches "71182625" but DB has "71/182625" 
          // We need to create patterns that will match DB values WITH separators
          // This generates patterns like: %71/182625%, %71-182625%, %71 182625%, etc.
          
          // Try all possible separator positions for this digit string
          for (let sepPos = 1; sepPos < digitString.length; sepPos++) {
            const beforeSep = digitString.substring(0, sepPos);
            const afterSep = digitString.substring(sepPos);
            
            if (beforeSep.length >= 1 && afterSep.length >= 1) {
              separators.forEach(sep => {
                // Basic separator pattern
                patterns.push(`%${beforeSep}${sep}${afterSep}%`);
                
                // With leading zero variations
                patterns.push(`%0${beforeSep}${sep}${afterSep}%`);
                patterns.push(`%00${beforeSep}${sep}${afterSep}%`);
                patterns.push(`%${beforeSep}${sep}0${afterSep}%`);
                
                // Phone number variations
                if (digitString.length >= 6) {
                  patterns.push(`%+961${beforeSep}${sep}${afterSep}%`);
                  patterns.push(`%961${beforeSep}${sep}${afterSep}%`);
                  patterns.push(`%00961${beforeSep}${sep}${afterSep}%`);
                  patterns.push(`%+961 ${beforeSep}${sep}${afterSep}%`);
                  patterns.push(`%961 ${beforeSep}${sep}${afterSep}%`);
                }
                
                // Multiple separator combinations
                if (afterSep.length >= 4) {
                  // Split the second part further
                  for (let secondSepPos = 2; secondSepPos < afterSep.length - 1; secondSepPos++) {
                    const middlePart = afterSep.substring(0, secondSepPos);
                    const endPart = afterSep.substring(secondSepPos);
                    
                    patterns.push(`%${beforeSep}${sep}${middlePart}${sep}${endPart}%`);
                    patterns.push(`%0${beforeSep}${sep}${middlePart}${sep}${endPart}%`);
                    patterns.push(`%+961${beforeSep}${sep}${middlePart}${sep}${endPart}%`);
                  }
                }
              });
            }
          }
        }
      });
      
      // 6. MULTIPLE SEPARATORS - Common phone formats
      [allDigits, trimmedDigits].forEach(digitString => {
        if (digitString.length >= 6) {
          const commonPhoneFormats = [
            // Lebanese formats
            `%+961 ${digitString.substring(0, 2)} ${digitString.substring(2)}%`,
            `%+961-${digitString.substring(0, 2)}-${digitString.substring(2)}%`,
            `%961 ${digitString.substring(0, 2)} ${digitString.substring(2)}%`,
            `%961-${digitString.substring(0, 2)}-${digitString.substring(2)}%`,
            `%00961 ${digitString.substring(0, 2)} ${digitString.substring(2)}%`,
            `%00961-${digitString.substring(0, 2)}-${digitString.substring(2)}%`,
            
            // Local formats
            `%0${digitString.substring(0, 2)} ${digitString.substring(2)}%`,
            `%0${digitString.substring(0, 2)}-${digitString.substring(2)}%`,
            `%0${digitString.substring(0, 2)}/${digitString.substring(2)}%`,
            
            // International formats
            `%(+961) ${digitString.substring(0, 2)} ${digitString.substring(2)}%`,
            `%(961) ${digitString.substring(0, 2)} ${digitString.substring(2)}%`,
          ];
          
          // Add different splitting positions for each format
          for (let splitPos = 2; splitPos <= Math.min(4, digitString.length - 2); splitPos++) {
            const part1 = digitString.substring(0, splitPos);
            const part2 = digitString.substring(splitPos);
            
            commonPhoneFormats.push(
              `%+961 ${part1} ${part2}%`,
              `%+961-${part1}-${part2}%`,
              `%961 ${part1} ${part2}%`,
              `%961-${part1}-${part2}%`,
              `%0${part1} ${part2}%`,
              `%0${part1}-${part2}%`,
              `%0${part1}/${part2}%`,
              `%(+961) ${part1} ${part2}%`,
              `%(961) ${part1} ${part2}%`
            );
            
            // Triple split for longer numbers
            if (part2.length >= 4) {
              const subPart1 = part2.substring(0, Math.floor(part2.length / 2));
              const subPart2 = part2.substring(Math.floor(part2.length / 2));
              
              commonPhoneFormats.push(
                `%+961 ${part1} ${subPart1} ${subPart2}%`,
                `%+961-${part1}-${subPart1}-${subPart2}%`,
                `%961 ${part1} ${subPart1} ${subPart2}%`,
                `%961-${part1}-${subPart1}-${subPart2}%`,
                `%0${part1} ${subPart1} ${subPart2}%`,
                `%0${part1}-${subPart1}-${subPart2}%`,
                `%(+961) ${part1} ${subPart1} ${subPart2}%`,
                `%(961) ${part1} ${subPart1} ${subPart2}%`
              );
            }
          }
          
          patterns.push(...commonPhoneFormats);
        }
      });
      
      // 7. RECORD NUMBER PATTERNS
      [allDigits, trimmedDigits].forEach(digitString => {
        if (digitString.length >= 3) {
          // Common record number formats
          const recordFormats = [
            `%${digitString.substring(0, 2)}/${digitString.substring(2)}%`,
            `%${digitString.substring(0, 3)}/${digitString.substring(3)}%`,
            `%${digitString.substring(0, 2)}-${digitString.substring(2)}%`,
            `%${digitString.substring(0, 3)}-${digitString.substring(3)}%`,
            `%REC${digitString}%`,
            `%rec${digitString}%`,
            `%R${digitString}%`,
            `%r${digitString}%`,
          ];
          
          // With leading zeros
          recordFormats.forEach(format => {
            patterns.push(format);
            for (let zeros = 1; zeros <= 3; zeros++) {
              const zeroPrefix = '0'.repeat(zeros);
              patterns.push(format.replace(digitString, `${zeroPrefix}${digitString}`));
            }
          });
        }
      });
      
      // 8. SUBSTRING MATCHING - Find digits as part of longer sequences
      // This finds the search digits anywhere within larger numbers
      [allDigits, trimmedDigits].forEach(digitString => {
        if (digitString.length >= 3) {
          patterns.push(`%${digitString}%`); // Already added, but ensures it's there
        }
      });
      
      // 9. REVERSED PATTERNS (sometimes numbers are stored/displayed differently)
      [allDigits, trimmedDigits].forEach(digitString => {
        if (digitString.length >= 4) {
          const reversed = digitString.split('').reverse().join('');
          patterns.push(`%${reversed}%`);
          
          // Reversed with separators
          for (let i = 1; i < reversed.length; i++) {
            const before = reversed.substring(0, i);
            const after = reversed.substring(i);
            patterns.push(`%${before}/${after}%`);
            patterns.push(`%${before}-${after}%`);
            patterns.push(`%${before} ${after}%`);
          }
        }
      });
      
      // 10. PARTIAL MATCHING - Super broad
      [allDigits, trimmedDigits].forEach(digitString => {
        if (digitString.length >= 4) {
          // Take different chunks of the digits
          for (let start = 0; start < digitString.length - 2; start++) {
            for (let length = 3; length <= digitString.length - start; length++) {
              const chunk = digitString.substring(start, start + length);
              if (chunk.length >= 3) {
                patterns.push(`%${chunk}%`);
                patterns.push(`%0${chunk}%`);
                patterns.push(`%00${chunk}%`);
              }
            }
          }
        }
      });
    }
  }
  
  // 11. NON-NUMERIC PATTERNS (for names, etc.)
  if (!searchTerm.match(/^\d+$/)) {
    // Add case variations
    patterns.push(`%${searchTerm.toUpperCase()}%`);
    
    // Add patterns for names with common prefixes/suffixes
    const namePrefixes = ['mr', 'mrs', 'ms', 'dr', 'prof'];
    const nameSuffixes = ['jr', 'sr', 'ii', 'iii'];
    
    namePrefixes.forEach(prefix => {
      patterns.push(`%${prefix} ${searchTerm.toLowerCase()}%`);
      patterns.push(`%${prefix.toUpperCase()} ${searchTerm.toLowerCase()}%`);
    });
    
    nameSuffixes.forEach(suffix => {
      patterns.push(`%${searchTerm.toLowerCase()} ${suffix}%`);
      patterns.push(`%${searchTerm.toLowerCase()} ${suffix.toUpperCase()}%`);
    });
  }
  
  // 12. Remove duplicates and limit to reasonable number
  const uniquePatterns = [...new Set(patterns)];
  
  // Return first 100 most relevant patterns to avoid query complexity
  return uniquePatterns.slice(0, 100);
}

// Mobile-friendly Quantity Input Modal
function QuantityModal({ 
  isOpen, 
  title, 
  message, 
  defaultValue, 
  maxValue,
  isSuperAdmin = false,
  isArabic = false,
  onConfirm, 
  onCancel 
}: QuantityModalProps) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      // Prevent body scroll on mobile
      document.body.style.overflow = 'hidden';
      // Focus input after modal animation
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 100);
    } else {
      // Restore body scroll
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-auto transform transition-all animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {title}
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              {message}
            </p>
            {isSuperAdmin && (
              <div className="mt-3 px-3 py-2 bg-orange-100 dark:bg-orange-900/30 border border-orange-300 dark:border-orange-600 rounded-lg">
                <span className="text-xs font-bold text-orange-800 dark:text-orange-200">
                  🚨 {isArabic ? "وضع المدير المتفوق" : "SUPER ADMIN MODE"}
                </span>
              </div>
            )}
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                ref={inputRef}
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="1"
                max={isSuperAdmin ? "999" : maxValue}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full px-4 py-3 text-lg text-center border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-blue-500 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors touch-manipulation"
                placeholder={isArabic ? "أدخل الكمية" : "Enter quantity"}
                autoFocus
              />
              {maxValue && !isSuperAdmin && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 text-center">
                  {isArabic ? `الحد الأقصى: ${maxValue}` : `Max: ${maxValue}`}
                </p>
              )}
            </div>
            
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors touch-manipulation min-h-[48px]"
              >
                {isArabic ? "إلغاء" : "Cancel"}
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors touch-manipulation min-h-[48px]"
              >
                {isArabic ? "تأكيد" : "Confirm"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// Mobile-friendly Confirmation Modal
function ConfirmModal({ 
  isOpen, 
  title, 
  message, 
  isArabic = false, 
  onConfirm, 
  onCancel 
}: ConfirmModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Enter') {
      onConfirm();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-auto transform transition-all animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {title}
            </h3>
            <div className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line">
              {message}
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors touch-manipulation min-h-[48px]"
            >
              {isArabic ? "إلغاء" : "Cancel"}
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors touch-manipulation min-h-[48px]"
            >
              {isArabic ? "تأكيد" : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mobile-friendly Alert Modal
function AlertModal({ 
  isOpen, 
  title, 
  message, 
  isArabic = false, 
  onClose 
}: AlertModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-auto transform transition-all animate-in fade-in-0 zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
              {title}
            </h3>
            <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">
              {message}
            </p>
          </div>
          
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors touch-manipulation min-h-[48px]"
          >
            {isArabic ? "موافق" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AttendeesPage() {
  const { locale } = useParams<{ locale: "en" | "ar" }>();
  const isArabic = locale === "ar";

  // Search and filtering state
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, DEBOUNCE_DELAY);
  const [govFilter, setGovFilter] = useState<string>("");
  const [districtFilter, setDistrictFilter] = useState<string>("");
  const [areaFilter, setAreaFilter] = useState<string>("");
  const [selectedField, setSelectedField] = useState<string>("");
  const [fieldCheckFilter, setFieldCheckFilter] = useState<"any" | "checked" | "not_checked">("any");

  // Sorting state
  const [sortKey, setSortKey] = useState<"name" | "recordNumber" | "governorate" | "district" | "area" | "quantity">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  // Data state
  const [attendees, setAttendees] = useState<AttendeeWithStatus[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [locationData, setLocationData] = useState<{
    governorates: string[];
    districts: string[];
    areas: string[];
  }>({ governorates: [], districts: [], areas: [] });

  // UI state
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('admin');
  const [loadError, setLoadError] = useState<string>("");
  const [isOnline, setIsOnline] = useState(true);

  // Modal state for mobile-friendly dialogs
  const [quantityModal, setQuantityModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    defaultValue: string;
    maxValue?: number;
    isSuperAdmin?: boolean;
    onConfirm: (value: string) => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    defaultValue: '1',
    onConfirm: () => {}
  });

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [alertModal, setAlertModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onClose?: () => void;
  }>({
    isOpen: false,
    title: '',
    message: ''
  });

  // Refs for cleanup and optimization
  const abortControllerRef = useRef<AbortController | null>(null);
  const realtimeChannelRef = useRef<any>(null);

  // Utility functions for mobile-friendly modals
  const showQuantityModal = (
    title: string,
    message: string,
    defaultValue: string = '1',
    maxValue?: number,
    isSuperAdmin: boolean = false
  ): Promise<string | null> => {
    return new Promise((resolve) => {
      const handleConfirm = (value: string) => {
        setQuantityModal(prev => ({ ...prev, isOpen: false }));
        resolve(value);
      };
      
      const handleCancel = () => {
        setQuantityModal(prev => ({ ...prev, isOpen: false }));
        resolve(null);
      };
      
      setQuantityModal({
        isOpen: true,
        title,
        message,
        defaultValue,
        maxValue,
        isSuperAdmin,
        onConfirm: handleConfirm,
        onCancel: handleCancel
      });
    });
  };

  const showConfirmModal = (title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const handleConfirm = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        resolve(true);
      };
      
      const handleCancel = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        resolve(false);
      };
      
      setConfirmModal({
        isOpen: true,
        title,
        message,
        onConfirm: handleConfirm,
        onCancel: handleCancel
      });
    });
  };

  const showAlertModal = (title: string, message: string): Promise<void> => {
    return new Promise((resolve) => {
      const handleClose = () => {
        setAlertModal(prev => ({ ...prev, isOpen: false }));
        resolve();
      };
      
      setAlertModal({
        isOpen: true,
        title,
        message,
        onClose: handleClose
      });
    });
  };

  // Translations
  const t = {
    search: isArabic ? "ابحث بالاسم أو رقم السجل أو رقم الهاتف" : "Search by name, record #, or phone",
    mark: isArabic ? "تأكيد" : "Mark",
    noData: isArabic ? "لا توجد سجلات" : "No records",
    confirmPrefix: isArabic ? "تأكيد: " : "Confirm: ",
    failed: isArabic ? "فشل التحديث" : "Update failed",
    filters: isArabic ? "تصفية" : "Filters",
    governorate: isArabic ? "المحافظة" : "Governorate",
    district: isArabic ? "القضاء" : "District",
    area: isArabic ? "المنطقة" : "Area",
    field: isArabic ? "المحطة" : "Field",
    any: isArabic ? "الكل" : "Any",
    checked: isArabic ? "مؤكد" : "Checked",
    notChecked: isArabic ? "غير مؤكد" : "Not checked",
    sortBy: isArabic ? "ترتيب حسب" : "Sort by",
    asc: isArabic ? "تصاعدي" : "Asc",
    desc: isArabic ? "تنازلي" : "Desc",
    errorLoading: isArabic ? "تعذر تحميل البيانات" : "Failed to load data",
    quantityLabel: isArabic ? "الكمية" : "Qty",
    agesLabel: isArabic ? "الأعمار" : "Ages",
    enterQty: isArabic ? "أدخل الكمية" : "Enter quantity",
    invalidQty: isArabic ? "قيمة غير صالحة" : "Invalid quantity",
    loadMore: isArabic ? "تحميل المزيد" : "Load More",
    offline: isArabic ? "غير متصل" : "Offline",
    retry: isArabic ? "إعادة المحاولة" : "Retry",
  };

  // Network status monitoring
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load fields and location data (static data)
  const loadStaticData = useCallback(async () => {
    try {
      // Load fields
      const { data: fieldRows, error: fieldsError } = await supabase
        .from("fields")
        .select("id,name,is_enabled,is_main,sort_order")
        .eq("is_enabled", true)
        .order("sort_order", { ascending: true });

      if (fieldsError) throw fieldsError;
      setFields(fieldRows || []);

      // Load location data for filters (aggregated)
      const { data: locationRows, error: locationError } = await supabase
        .from("attendees")
        .select("governorate,district,area");

      if (locationError) throw locationError;

      const governorates = Array.from(new Set(locationRows?.map(r => r.governorate) || [])).sort();
      const districts = Array.from(new Set(locationRows?.map(r => r.district) || [])).sort();
      const areas = Array.from(new Set(locationRows?.map(r => r.area) || [])).sort();

      setLocationData({ governorates, districts, areas });
    } catch (error) {
      console.error("Error loading static data:", error);
      setLoadError((error as Error).message);
    }
  }, []);

  // Optimized data loading with pagination
  const loadAttendees = useCallback(async (
    page: number = 1,
    append: boolean = false,
    signal?: AbortSignal
  ) => {
    if (!append) {
      setLoading(true);
      setLoadError("");
    } else {
      setLoadingMore(true);
    }

    try {
      // Build optimized query
      let query = supabase
        .from("attendees")
        .select(`
          id,
          name,
          record_number,
          governorate,
          district,
          area,
          phone,
          quantity,
          age
        `, { count: 'exact' });

      // Apply filters with ultra-comprehensive search patterns
      if (debouncedQuery) {
        const searchPatterns = generateSlashPatterns(debouncedQuery);
        const searchConditions: string[] = [];
        
        console.log(`Generated ${searchPatterns.length} search patterns for: "${debouncedQuery}"`);
        
        // Use all generated patterns (already limited to 100 in the function)
        searchPatterns.forEach(pattern => {
          searchConditions.push(`name.ilike.${pattern}`);
          searchConditions.push(`record_number.ilike.${pattern}`);
          searchConditions.push(`phone.ilike.${pattern}`);
        });
        
        // Combine all conditions with OR
        if (searchConditions.length > 0) {
          query = query.or(searchConditions.join(','));
        }
      }

      if (govFilter) query = query.eq("governorate", govFilter);
      if (districtFilter) query = query.eq("district", districtFilter);
      if (areaFilter) query = query.eq("area", areaFilter);

      // Apply sorting
      const ascending = sortDir === "asc";
      query = query.order(sortKey === "recordNumber" ? "record_number" : sortKey, { ascending });

      // Apply pagination
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, error, count } = await query;

      if (signal?.aborted) return;
      if (error) throw error;

      // Transform data
      const transformedData: AttendeeWithStatus[] = (data || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        recordNumber: r.record_number,
        governorate: r.governorate,
        district: r.district,
        area: r.area,
        phone: r.phone,
        quantity: r.quantity,
        ages: Array.isArray(r.age)
          ? (r.age as any[]).map((x) => (typeof x === "number" ? x : parseInt(String(x), 10))).filter((n) => Number.isFinite(n))
          : typeof r.age === "number"
          ? [r.age]
          : typeof r.age === "string"
          ? [parseInt(r.age, 10)].filter((n) => Number.isFinite(n))
          : [],
        fieldStatuses: {}
      }));

      // Load field statuses for current batch
      if (transformedData.length > 0) {
        const attendeeIds = transformedData.map(a => a.id);
        const { data: statusData, error: statusError } = await supabase
          .from("attendee_field_status")
          .select("attendee_id,field_id,checked_at,quantity")
          .in("attendee_id", attendeeIds);

        if (statusError) throw statusError;

        // Map status data
        const statusMap: Record<string, Record<string, { checkedAt: string | null; quantity: number }>> = {};
        (statusData || []).forEach(row => {
          if (!statusMap[row.attendee_id]) statusMap[row.attendee_id] = {};
          statusMap[row.attendee_id][row.field_id] = {
            checkedAt: row.checked_at,
            quantity: row.quantity || 1
          };
        });

        // Apply field check filter if specified
        let filteredData = transformedData;
        if (selectedField && fieldCheckFilter !== "any") {
          filteredData = transformedData.filter(a => {
            const checked = !!statusMap[a.id]?.[selectedField]?.checkedAt;
            return fieldCheckFilter === "checked" ? checked : !checked;
          });
        }

        // Update field statuses
        filteredData.forEach(attendee => {
          attendee.fieldStatuses = statusMap[attendee.id] || {};
        });

        if (append) {
          setAttendees(prev => [...prev, ...filteredData]);
        } else {
          setAttendees(filteredData);
        }
      } else {
        if (!append) setAttendees([]);
      }

      setTotalCount(count || 0);
      setHasMore((count || 0) > page * PAGE_SIZE);

    } catch (error) {
      if (signal?.aborted) return;
      console.error("Error loading attendees:", error);
      setLoadError((error as Error).message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [debouncedQuery, govFilter, districtFilter, areaFilter, selectedField, fieldCheckFilter, sortKey, sortDir]);

  // Load more handler
  const handleLoadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      setCurrentPage(prev => prev + 1);
    }
  }, [loadingMore, hasMore]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
    setAttendees([]);
    setHasMore(true);
  }, [debouncedQuery, govFilter, districtFilter, areaFilter, selectedField, fieldCheckFilter, sortKey, sortDir]);

  // Load data when page changes
  useEffect(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const append = currentPage > 1;
    loadAttendees(currentPage, append, abortControllerRef.current.signal);

    return () => {
      abortControllerRef.current?.abort();
    };
  }, [currentPage, loadAttendees]);

  // Setup real-time subscriptions (optimized)
  useEffect(() => {
    const setupRealtime = () => {
      realtimeChannelRef.current = supabase
        .channel("attendee_field_status_changes")
        .on(
          "postgres_changes",
          { 
            event: "*", 
            schema: "public", 
            table: "attendee_field_status" 
          },
          (payload: any) => {
            const row = payload.new ?? payload.old;
            if (!row) return;
            
            const attendeeId = row.attendee_id as string;
            const fieldId = row.field_id as string;
            const checkedAt = payload.eventType === "DELETE" ? null : (row.checked_at as string | null);
            const quantity = payload.eventType === "DELETE" ? 1 : (row.quantity || 1);
            
            // Update only if attendee is in current view
            setAttendees(prev => prev.map(attendee => {
              if (attendee.id === attendeeId) {
                return {
                  ...attendee,
                  fieldStatuses: {
                    ...attendee.fieldStatuses,
                    [fieldId]: { checkedAt, quantity }
                  }
                };
              }
              return attendee;
            }));
          }
        )
        .on(
          "postgres_changes",
          { 
            event: "*", 
            schema: "public", 
            table: "fields" 
          },
          (payload: any) => {
            // Reload fields when they change (enabled/disabled status)
            loadStaticData();
          }
        )
        .subscribe();
    };

    if (isOnline) {
      setupRealtime();
    }

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
      }
    };
  }, [isOnline, loadStaticData]);

  // Load static data on mount
  useEffect(() => {
    loadStaticData();
  }, [loadStaticData]);

  // Check user role
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const user = userRes?.user;
        if (!user || !isMounted) return;
        
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
          
        if (isMounted && profile) {
          setUserRole(profile.role);
          setIsSuperAdmin(profile.role === "super_admin");
        }
      } catch (error) {
        console.error("Error checking user role:", error);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Optimized mark/unmark function
  const handleMarkField = useCallback(async (
    attendee: AttendeeWithStatus,
    field: Field,
    selectedQty: number = 1
  ) => {
    const key = `${attendee.id}:${field.id}`;
    const currentStatus = attendee.fieldStatuses[field.id];
    const isUnchecking = !!currentStatus?.checkedAt;

    setBusy(prev => new Set(prev).add(key));

    try {
      const result = await withRetry(async () => {
        if (isUnchecking) {
          return await supabase
            .from("attendee_field_status")
            .update({ checked_at: null, quantity: 1 })
            .eq("attendee_id", attendee.id)
            .eq("field_id", field.id);
        } else {
          return await supabase
            .from("attendee_field_status")
            .upsert(
              { 
                attendee_id: attendee.id, 
                field_id: field.id, 
                checked_at: new Date().toISOString(),
                quantity: selectedQty
              }, 
              { onConflict: "attendee_id,field_id" }
            );
        }
      });

      if (result.error) {
        throw result.error;
      }

      // Optimistic update will be handled by real-time subscription
    } catch (error) {
      console.error("Database error:", error);
      alert(`${t.failed}: ${(error as Error).message}`);
    } finally {
      setBusy(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [t.failed]);

  const mainField = fields.find(f => f.is_main);

  return (
    <div className="space-y-6">
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
          <span className="font-medium">{t.offline}</span> - Changes will sync when connection is restored
        </div>
      )}

      {/* Page Header */}
      <div className="text-center lg:text-left">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-[var(--foreground)] mb-2">
              {isArabic ? "إدارة الحضور" : "Attendee Management"}
            </h1>
            <p className="text-[var(--muted)] text-responsive">
              {isArabic ? "تتبع وإدارة حضور المشاركين" : "Track and manage participant attendance"}
            </p>
          </div>
          {isSuperAdmin && (
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg shadow-lg">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span className="font-bold text-sm">SUPER ADMIN MODE</span>
            </div>
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div className="glass rounded-2xl">
        <input
          placeholder={t.search}
          className="w-full px-4 py-3 rounded-xl glass border-[var(--border-glass)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-accent)] transition-all"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Filters Panel */}
      <div className="glass rounded-2xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 text-sm">
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.governorate}</label>
            <select 
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
              value={govFilter} 
              onChange={(e) => { 
                setGovFilter(e.target.value); 
                setDistrictFilter(""); 
                setAreaFilter(""); 
              }}
            >
              <option value="">{t.any}</option>
              {locationData.governorates.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
          
          {/* Add other filter controls similarly */}
          
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.district}</label>
            <select 
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
              value={districtFilter} 
              onChange={(e) => { 
                setDistrictFilter(e.target.value); 
                setAreaFilter(""); 
              }}
              disabled={!govFilter}
            >
              <option value="">{t.any}</option>
              {locationData.districts
                .filter(d => !govFilter || d === govFilter)
                .map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
            </select>
          </div>
          
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.area}</label>
            <select 
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
              value={areaFilter} 
              onChange={(e) => setAreaFilter(e.target.value)}
              disabled={!districtFilter}
            >
              <option value="">{t.any}</option>
              {locationData.areas
                .filter(a => !districtFilter || a === districtFilter)
                .map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
            </select>
          </div>
          
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.field}</label>
            <select 
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
              value={selectedField} 
              onChange={(e) => setSelectedField(e.target.value)}
            >
              <option value="">{t.any}</option>
              {fields.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="text-[var(--muted)] text-sm font-medium mb-2 block">Status</label>
            <select 
              className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
              value={fieldCheckFilter} 
              onChange={(e) => setFieldCheckFilter(e.target.value as any)}
            >
              <option value="any">{t.any}</option>
              <option value="checked">{t.checked}</option>
              <option value="not_checked">{t.notChecked}</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{t.sortBy}</label>
              <select 
                className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
                value={sortKey} 
                onChange={(e) => setSortKey(e.target.value as any)}
              >
                <option value="name">Name</option>
                <option value="recordNumber">Record #</option>
                <option value="governorate">{t.governorate}</option>
                <option value="district">{t.district}</option>
                <option value="area">{t.area}</option>
                <option value="quantity">Qty</option>
              </select>
            </div>
            <div>
              <label className="text-[var(--muted)] text-sm font-medium mb-2 block">{isArabic ? "الاتجاه" : "Order"}</label>
              <select 
                className="w-full glass rounded-xl px-3 py-2.5 border-[var(--border-glass)] focus:border-[var(--brand)] focus:outline-none transition-all" 
                value={sortDir} 
                onChange={(e) => setSortDir(e.target.value as any)}
              >
                <option value="asc">{t.asc}</option>
                <option value="desc">{t.desc}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--brand)]" />
            {isArabic ? "النتائج" : "Results"}
            <span className="text-sm font-normal text-[var(--muted)]">({totalCount})</span>
          </h2>
        </div>
        
        {/* Error State */}
        {loadError && (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="text-red-600 text-lg mb-4">{t.errorLoading}: {loadError}</div>
            <button
              onClick={() => {
                setLoadError("");
                setCurrentPage(1);
                loadAttendees(1);
              }}
              className="px-4 py-2 bg-[var(--brand)] text-white rounded-lg hover:bg-[var(--brand-hover)] transition-colors"
            >
              {t.retry}
            </button>
          </div>
        )}
        
        {/* Loading State */}
        {loading && (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="w-8 h-8 border-4 border-[var(--brand)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <div className="text-[var(--muted)] text-lg">Loading...</div>
          </div>
        )}
        
        {/* Attendees List */}
        {!loading && attendees.length === 0 && !loadError && (
          <div className="glass rounded-2xl p-8 text-center">
            <div className="text-[var(--muted)] text-lg">{t.noData}</div>
          </div>
        )}
        
        <div className="grid gap-4">
          {attendees.map((attendee) => (
            <AttendeeCard
              key={attendee.id}
              attendee={attendee}
              fields={fields}
              mainField={mainField}
              isSuperAdmin={isSuperAdmin}
              userRole={userRole}
              busy={busy}
              onMarkField={handleMarkField}
              translations={t}
              isArabic={isArabic}
              showQuantityModal={showQuantityModal}
              showConfirmModal={showConfirmModal}
              showAlertModal={showAlertModal}
            />
          ))}
        </div>

        {/* Load More Button */}
        {hasMore && !loading && (
          <div className="text-center">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="px-6 py-3 bg-[var(--brand)] text-white rounded-lg hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block mr-2" />
                  Loading...
                </>
              ) : (
                t.loadMore
              )}
            </button>
          </div>
        )}
      </div>

      {/* Mobile-friendly Modal Components */}
      <QuantityModal
        isOpen={quantityModal.isOpen}
        title={quantityModal.title}
        message={quantityModal.message}
        defaultValue={quantityModal.defaultValue}
        maxValue={quantityModal.maxValue}
        isSuperAdmin={quantityModal.isSuperAdmin}
        isArabic={isArabic}
        onConfirm={quantityModal.onConfirm}
        onCancel={quantityModal.onCancel || (() => setQuantityModal(prev => ({ ...prev, isOpen: false })))}
      />
      
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        isArabic={isArabic}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.onCancel || (() => setConfirmModal(prev => ({ ...prev, isOpen: false })))}
      />
      
      <AlertModal
        isOpen={alertModal.isOpen}
        title={alertModal.title}
        message={alertModal.message}
        isArabic={isArabic}
        onClose={alertModal.onClose || (() => setAlertModal(prev => ({ ...prev, isOpen: false })))}
      />
    </div>
  );
}

// Optimized Attendee Card Component
function AttendeeCard({
  attendee,
  fields,
  mainField,
  isSuperAdmin,
  userRole,
  busy,
  onMarkField,
  translations: t,
  isArabic,
  showQuantityModal,
  showConfirmModal,
  showAlertModal
}: {
  attendee: AttendeeWithStatus;
  fields: Field[];
  mainField?: Field;
  isSuperAdmin: boolean;
  userRole: UserRole;
  busy: Set<string>;
  onMarkField: (attendee: AttendeeWithStatus, field: Field, quantity?: number) => Promise<void>;
  translations: any;
  isArabic: boolean;
  showQuantityModal: (title: string, message: string, defaultValue?: string, maxValue?: number, isSuperAdmin?: boolean) => Promise<string | null>;
  showConfirmModal: (title: string, message: string) => Promise<boolean>;
  showAlertModal: (title: string, message: string) => Promise<void>;
}) {
  return (
    <div className="card p-4 lg:p-6 hover:shadow-xl transition-all duration-300">
      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
        {/* Attendee Info */}
        <div className="flex-1 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <h3 className="font-semibold text-lg text-[var(--foreground)]">{attendee.name}</h3>

          </div>
          <div className="flex flex-wrap gap-2 text-sm text-[var(--muted)]">
            {attendee.phone && (
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-[var(--brand)]" />
                {attendee.phone}
              </span>
            )}
            <span className="flex items-center gap-1 font-medium">
              <span className="w-1 h-1 rounded-full bg-orange-500" />
              {t.quantityLabel}: {attendee.quantity}
            </span>
            {attendee.ages.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full bg-purple-500" />
                {t.agesLabel}: {attendee.ages.join(", ")}
              </span>
            )}
          </div>
        </div>
        
        {/* Station Actions */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {fields.map((field) => {
            const status = attendee.fieldStatuses[field.id];
            const checked = !!status?.checkedAt;
            const mainChecked = mainField ? !!attendee.fieldStatuses[mainField.id]?.checkedAt : true;
            const roleRestricted = !canUserModifyField(userRole, field.name);
            const disabled = (!isSuperAdmin && !field.is_main && !mainChecked) || roleRestricted;
            const key = `${attendee.id}:${field.id}`;
            const fieldQuantity = status?.checkedAt ? (status.quantity || 1) : 0;
            
            return (
              <Station
                key={field.id}
                label={field.name}
                active={checked}
                disabled={disabled}
                busy={busy.has(key)}
                isSuperAdmin={isSuperAdmin}
                userRole={userRole}
                fieldName={field.name}
                quantity={fieldQuantity}
                totalQuantity={attendee.quantity}
                onMark={async () => {
                  const isUnchecking = checked;
                  let selectedQty = 1;
                  
                  if (isSuperAdmin) {
                    if (!isUnchecking) {
                      const input = await showQuantityModal(
                        isArabic ? "إدخال الكمية - مدير متفوق" : "Enter Quantity - Super Admin",
                        `${isArabic ? "أدخل الكمية (المدير المتفوق يمكنه تجاوز الحد الأقصى)" : "Enter quantity (Super Admin can exceed limits)"}\n(1 - 999)`,
                        "1",
                        999,
                        true
                      );
                      if (input == null) return;
                      const parsed = parseInt(input, 10);
                      if (!Number.isFinite(parsed) || parsed < 1) {
                        await showAlertModal(
                          isArabic ? "خطأ" : "Error",
                          isArabic ? "قيمة غير صالحة" : "Invalid quantity"
                        );
                        return;
                      }
                      selectedQty = parsed;
                    }
                    
                    const superAdminConfirm = await showConfirmModal(
                      "🚨 SUPER ADMIN ACTION 🚨",
                      `${isUnchecking ? "Force uncheck" : "Force check-in"} ${field.name} for ${attendee.name}\nQuantity: ${selectedQty}\n\nThis action bypasses all restrictions!\nAre you sure?`
                    );
                    if (!superAdminConfirm) return;
                  } else {
                    if (!isUnchecking) {
                      const maxQty = Math.max(1, attendee.quantity ?? 1);
                      if (maxQty > 1) {
                        const input = await showQuantityModal(
                          isArabic ? "إدخال الكمية" : "Enter Quantity",
                          `${t.enterQty} (1 - ${maxQty})`,
                          "1",
                          maxQty,
                          false
                        );
                        if (input == null) return;
                        const parsed = parseInt(input, 10);
                        if (!Number.isFinite(parsed) || parsed < 1 || parsed > maxQty) {
                          await showAlertModal(
                            isArabic ? "خطأ" : "Error",
                            t.invalidQty
                          );
                          return;
                        }
                        selectedQty = parsed;
                      }
                    }
                    
                    const action = isUnchecking ? (isArabic ? "إلغاء تأكيد" : "Uncheck") : (isArabic ? "تأكيد" : "Check");
                    const confirmed = await showConfirmModal(
                      isArabic ? "تأكيد العملية" : "Confirm Action",
                      `${t.confirmPrefix}${action} ${field.name} - ${attendee.name}`
                    );
                    if (!confirmed) return;
                  }
                  
                  await onMarkField(attendee, field, selectedQty);
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Optimized Station Component
function Station({ 
  label, 
  active, 
  disabled = false, 
  busy = false, 
  isSuperAdmin = false, 
  userRole, 
  fieldName, 
  quantity = 0, 
  totalQuantity = 1, 
  onMark 
}: { 
  label: string; 
  active: boolean; 
  disabled?: boolean; 
  busy?: boolean; 
  isSuperAdmin?: boolean; 
  userRole?: UserRole; 
  fieldName?: string; 
  quantity?: number; 
  totalQuantity?: number; 
  onMark: () => Promise<void>;
}) {
  const canModify = !fieldName || !userRole || canUserModifyField(userRole, fieldName);
  const isDisabled = disabled || !canModify;
  const roleRestricted = !canModify && userRole && !['admin', 'super_admin'].includes(userRole);
  
  const baseClasses = "inline-flex items-center justify-center px-3 py-2 rounded-xl text-sm font-medium transition-all duration-200";
  
  if (active) {
    const activeClasses = isSuperAdmin 
      ? `${baseClasses} bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg hover:from-green-600 hover:to-green-700 hover:scale-105 active:scale-95 cursor-pointer`
      : `${baseClasses} bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg`;
    
    return (
      <button
        disabled={busy || isDisabled}
        title={isSuperAdmin ? `${label} (click to uncheck)` : label}
        className={activeClasses}
        onClick={isSuperAdmin && !busy && !isDisabled ? onMark : undefined}
      >
        {busy ? (
          <>
            <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin mr-2" />
            <div className="text-center">
              <div>{label}</div>
              {totalQuantity > 1 && (
                <div className="text-sm font-semibold opacity-90 bg-white/20 px-2 py-1 rounded-lg mt-1">
                  {quantity}/{totalQuantity}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <span className="w-1.5 h-1.5 rounded-full bg-white/80 mr-2" />
            <div className="text-center">
              <div>{label}</div>
              {totalQuantity > 1 && (
                <div className="text-sm font-semibold opacity-90 bg-white/20 px-2 py-1 rounded-lg mt-1">
                  {quantity}/{totalQuantity}
                </div>
              )}
            </div>
          </>
        )}
      </button>
    );
  }

  const inactiveClasses = `${baseClasses} glass border-[var(--border-glass)] hover:bg-[var(--surface-glass-hover)] hover:border-[var(--brand)] hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${isSuperAdmin && isDisabled ? 'border-orange-500/50 hover:border-orange-500' : ''} ${roleRestricted ? 'border-red-500/50 hover:border-red-500' : ''}`;
  
  return (
    <button
      disabled={busy || (isDisabled && !isSuperAdmin)}
      title={isDisabled ? (isSuperAdmin ? `${label} (disabled - Super Admin can override)` : roleRestricted ? `${label} (role restricted)` : `${label} (disabled)`) : label}
      className={inactiveClasses}
      onClick={!busy && !isDisabled ? onMark : undefined}
    >
      {busy ? (
        <>
          <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin mr-2" />
          <div className="text-center">
            <div>{label}</div>
            {totalQuantity > 1 && (
              <div className="text-sm font-semibold opacity-70 bg-[var(--muted)]/20 px-2 py-1 rounded-lg mt-1">
                {quantity}/{totalQuantity}
              </div>
            )}
            {isSuperAdmin && isDisabled && !roleRestricted && (
              <div className="text-xs text-orange-600 font-bold mt-1 px-2 py-1 bg-orange-100/50 rounded border border-orange-300/50">
                OVERRIDE
              </div>
            )}
            {roleRestricted && (
              <div className="text-xs text-red-600 font-bold mt-1 px-2 py-1 bg-red-100/50 rounded border border-red-300/50">
                ROLE RESTRICTED
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--muted)] mr-2" />
          <div className="text-center">
            <div>{label}</div>
            {totalQuantity > 1 && (
              <div className="text-sm font-semibold opacity-70 bg-[var(--muted)]/20 px-2 py-1 rounded-lg mt-1">
                {quantity}/{totalQuantity}
              </div>
            )}
            {isSuperAdmin && isDisabled && !roleRestricted && (
              <div className="text-xs text-orange-600 font-bold mt-1 px-2 py-1 bg-orange-100/50 rounded border border-orange-300/50">
                OVERRIDE
              </div>
            )}
            {roleRestricted && (
              <div className="text-xs text-red-600 font-bold mt-1 px-2 py-1 bg-red-100/50 rounded border border-red-300/50">
                ROLE RESTRICTED
              </div>
            )}
          </div>
        </>
      )}
    </button>
  );
}