import { Menu, Transition } from "@headlessui/react";
import { Fragment } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";

function Pagination({ currentPage, totalPages, onPageChange }) {
  const pages = [];
  const ellipsisPages = [];
  
  // Generate page numbers to display
  for (let i = 1; i <= totalPages; i++) {
    // Always show first page, last page, current page, and pages around current
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      pages.push(i);
    } else {
      ellipsisPages.push(i);
    }
  }

  // Split ellipsis pages into before and after current page
  const beforePages = ellipsisPages.filter(p => p < currentPage);
  const afterPages = ellipsisPages.filter(p => p > currentPage);

  const renderPageButton = (page) => (
    <button
      key={page}
      onClick={() => onPageChange(page)}
      className={`flex items-center justify-center w-9 h-9 rounded-lg font-family-poppins text-sm transition-all ${
        currentPage === page
          ? 'bg-teal-button text-white font-semibold'
          : 'border border-[#D0D0D0] text-gray hover:bg-gray-50'
      }`}
      aria-label={`Page ${page}`}
      aria-current={currentPage === page ? 'page' : undefined}
    >
      {page}
    </button>
  );

  const renderEllipsisMenu = (pagesList, key) => {
    if (pagesList.length === 0) return null;

    return (
      <Menu as="div" className="relative inline-block" key={key}>
        <Menu.Button className="flex items-center justify-center w-9 h-9 rounded-lg border border-[#D0D0D0] hover:bg-gray-50 transition-all">
          <MoreHorizontal size={18} className="text-gray" />
        </Menu.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items className="absolute z-10 mt-2 w-20 origin-top-center rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
            <div className="py-1 max-h-48 overflow-y-auto">
              {pagesList.map((page) => (
                <Menu.Item key={page}>
                  {({ active }) => (
                    <button
                      onClick={() => onPageChange(page)}
                      className={`${
                        active ? 'bg-gray-100' : ''
                      } w-full text-center px-4 py-2 text-sm font-family-poppins text-gray hover:bg-gray-50`}
                    >
                      {page}
                    </button>
                  )}
                </Menu.Item>
              ))}
            </div>
          </Menu.Items>
        </Transition>
      </Menu>
    );
  };

  return (
    <nav className="flex items-center justify-center gap-2 mt-6" aria-label="Pagination">
      {/* Previous Button */}
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-[#D0D0D0] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        aria-label="Previous page"
      >
        <ChevronLeft size={18} className="text-gray" />
      </button>

      {/* Page 1 */}
      {pages.includes(1) && renderPageButton(1)}
      
      {/* Ellipsis Menu for pages before current */}
      {beforePages.length > 0 && !pages.includes(2) && renderEllipsisMenu(beforePages, 'before')}
      
      {/* Pages around current */}
      {pages.filter(p => p !== 1 && p !== totalPages).map(renderPageButton)}
      
      {/* Ellipsis Menu for pages after current */}
      {afterPages.length > 0 && !pages.includes(totalPages - 1) && renderEllipsisMenu(afterPages, 'after')}
      
      {/* Last Page */}
      {pages.includes(totalPages) && totalPages > 1 && renderPageButton(totalPages)}

      {/* Next Button */}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="flex items-center justify-center w-9 h-9 rounded-lg border border-[#D0D0D0] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        aria-label="Next page"
      >
        <ChevronRight size={18} className="text-gray" />
      </button>
    </nav>
  );
}

export default Pagination;
