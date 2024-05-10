const GridList: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  return (
    <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5 xl:gap-6">
      {children}
    </div>
  );
};

export default GridList;
